import { useState, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css';

// Update this timestamp whenever you make a new commit!
const APP_VERSION = "2026-06-14_1212";

const generateLines = (count) => {
  const lines = [];
  for(let i = 0; i <= count; i++) {
    lines.push((i / count) * 100);
  }
  return lines;
};

function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  
  const [cols, setCols] = useState(6);
  const [rows, setRows] = useState(5);
  
  const [vLines, setVLines] = useState(generateLines(6));
  const [hLines, setHLines] = useState(generateLines(5));
  
  const [zoom, setZoom] = useState(1);
  
  const imgRef = useRef(null);
  const MASTER_SCALE = 3; 

  const handleColsChange = (e) => {
    const newCols = Math.max(1, parseInt(e.target.value) || 1);
    setCols(newCols);
    setVLines(generateLines(newCols)); 
  };

  const handleRowsChange = (e) => {
    const newRows = Math.max(1, parseInt(e.target.value) || 1);
    setRows(newRows);
    setHLines(generateLines(newRows)); 
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setImageSrc(event.target.result);
      reader.readAsDataURL(file);
      setZoom(1);
    }
  };

  const handleVLineChange = (index, value) => {
    const updated = [...vLines];
    updated[index] = parseFloat(value) || 0;
    setVLines(updated);
  };

  const handleHLineChange = (index, value) => {
    const updated = [...hLines];
    updated[index] = parseFloat(value) || 0;
    setHLines(updated);
  };

  const trimCanvasEdges = (sourceCanvas) => {
    const ctx = sourceCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const data = imgData.data;

    let minX = sourceCanvas.width, minY = sourceCanvas.height, maxX = 0, maxY = 0;
    let hasPixels = false;

    for (let y = 0; y < sourceCanvas.height; y++) {
      for (let x = 0; x < sourceCanvas.width; x++) {
        const index = (y * sourceCanvas.width + x) * 4;
        const alpha = data[index + 3];
        const isWhite = data[index] > 240 && data[index + 1] > 240 && data[index + 2] > 240;

        if (alpha > 10 && !isWhite) {
          hasPixels = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!hasPixels) return null;

    const padding = 10 * MASTER_SCALE;
    const width = (maxX - minX) + (padding * 2);
    const height = (maxY - minY) + (padding * 2);

    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = width;
    trimmedCanvas.height = height;
    const trimmedCtx = trimmedCanvas.getContext('2d');
    
    trimmedCtx.drawImage(
      sourceCanvas, 
      minX - padding, minY - padding, width, height, 
      0, 0, width, height
    );
    return trimmedCanvas;
  };

  const getTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}${minutes}`;
  };

  const processStickers = async () => {
    if (!imgRef.current) return;
    
    setIsProcessing(true);
    setProgress('Upscaling and slicing image...');
    
    const zip = new JSZip();
    const img = imgRef.current;
    const timestamp = getTimestamp();

    const masterCanvas = document.createElement('canvas');
    masterCanvas.width = img.naturalWidth * MASTER_SCALE;
    masterCanvas.height = img.naturalHeight * MASTER_SCALE;
    
    const masterCtx = masterCanvas.getContext('2d');
    masterCtx.imageSmoothingEnabled = true;
    masterCtx.imageSmoothingQuality = 'high';
    masterCtx.drawImage(img, 0, 0, masterCanvas.width, masterCanvas.height);
    
    let processedCount = 0;
    const totalStickers = rows * cols;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        processedCount++;
        setProgress(`Slicing sticker ${processedCount} of ${totalStickers}...`);

        const startX = (vLines[c] / 100) * masterCanvas.width;
        const endX = (vLines[c+1] / 100) * masterCanvas.width;
        const startY = (hLines[r] / 100) * masterCanvas.height;
        const endY = (hLines[r+1] / 100) * masterCanvas.height;

        const cellWidth = endX - startX;
        const cellHeight = endY - startY;
        
        if (cellWidth <= 0 || cellHeight <= 0) continue; 

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = cellWidth;
        sliceCanvas.height = cellHeight;
        const sliceCtx = sliceCanvas.getContext('2d');
        
        sliceCtx.drawImage(
          masterCanvas,
          startX, startY, cellWidth, cellHeight,
          0, 0, cellWidth, cellHeight
        );

        const croppedCanvas = trimCanvasEdges(sliceCanvas);
        
        if (croppedCanvas) {
          const rowNum = String(r + 1).padStart(2, '0');
          const colNum = String(c + 1).padStart(2, '0');
          const fileName = `r${rowNum}_c${colNum}_${timestamp}.png`;
          
          const blob = await new Promise(resolve => croppedCanvas.toBlob(resolve, 'image/png'));
          zip.file(fileName, blob);
        }
      }
    }

    setProgress('Zipping files...');
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `Stickers_${timestamp}.zip`);
    
    setIsProcessing(false);
    setProgress('');
  };

  return (
    <div className="App" style={{ textAlign: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Sticker Slicer PWA</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} />
      </div>

      {imageSrc && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          <div style={{ 
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '30px', 
            padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '8px', marginBottom: '20px',
            maxWidth: '1000px', width: '100%'
          }}>
            
            <div style={{ borderRight: '2px solid #ccc', paddingRight: '20px' }}>
              <h4>Grid Basics</h4>
              <label>Cols: <input type="number" value={cols} onChange={handleColsChange} style={{ width: '50px' }} /></label>
              <br/><br/>
              <label>Rows: <input type="number" value={rows} onChange={handleRowsChange} style={{ width: '50px' }} /></label>
              <br/><br/>
              <label>Zoom: <input type="range" min="0.5" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ width: '100px' }}/></label>
            </div>

            <div style={{ borderRight: '2px solid #ccc', paddingRight: '20px', maxHeight: '200px', overflowY: 'auto', textAlign: 'left' }}>
              <h4 style={{ marginTop: 0 }}>Nudge Vertical Lines</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {vLines.map((val, i) => (
                  <div key={`v-input-${i}`} style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ width: '50px' }}>Line {i + 1}:</span>
                    <input 
                      type="range" min="0" max="100" step="0.1" 
                      value={val} onChange={(e) => handleVLineChange(i, e.target.value)} 
                      style={{ width: '100px', margin: '0 10px' }} 
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ maxHeight: '200px', overflowY: 'auto', textAlign: 'left' }}>
              <h4 style={{ marginTop: 0 }}>Nudge Horizontal Lines</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {hLines.map((val, i) => (
                  <div key={`h-input-${i}`} style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ width: '50px' }}>Line {i + 1}:</span>
                    <input 
                      type="range" min="0" max="100" step="0.1" 
                      value={val} onChange={(e) => handleHLineChange(i, e.target.value)} 
                      style={{ width: '100px', margin: '0 10px' }} 
                    />
                  </div>
                ))}
              </div>
            </div>

          </div>

          <div style={{
            width: '100%', maxWidth: '1000px', height: '600px', 
            overflow: 'auto', border: '2px solid #333', marginBottom: '20px',
            backgroundColor: '#e9ecef', position: 'relative'
          }}>
            <div style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              display: 'inline-block',
              position: 'relative'
            }}>
              
              <img ref={imgRef} src={imageSrc} alt="Preview" style={{ display: 'block', maxWidth: '100%' }} />
              
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                {vLines.map((pos, i) => (
                  <div key={`v-line-${i}`} style={{
                    position: 'absolute', left: `${pos}%`, top: 0, bottom: 0,
                    borderLeft: '2px dashed red', transform: 'translateX(-1px)'
                  }} />
                ))}

                {hLines.map((pos, i) => (
                  <div key={`h-line-${i}`} style={{
                    position: 'absolute', top: `${pos}%`, left: 0, right: 0,
                    borderTop: '2px dashed red', transform: 'translateY(-1px)'
                  }} />
                ))}
              </div>

            </div>
          </div>
          
          <button 
            onClick={processStickers} 
            disabled={isProcessing}
            style={{ 
              padding: '12px 24px', fontSize: '16px', 
              backgroundColor: isProcessing ? '#cccccc' : '#007bff', 
              color: 'white', border: 'none', borderRadius: '4px', cursor: isProcessing ? 'not-allowed' : 'pointer',
              marginBottom: '40px'
            }}
          >
            {isProcessing ? 'Processing...' : 'Slice Based on Red Gridlines'}
          </button>
          
          {isProcessing && <p style={{ marginTop: '15px', fontWeight: 'bold', color: '#0056b3' }}>{progress}</p>}
        </div>
      )}
      
      {/* Dynamic Version Display */}
      <div style={{ marginTop: '40px', fontSize: '12px', color: '#888' }}>
        Version: {APP_VERSION}
      </div>
    </div>
  );
}

export default App;

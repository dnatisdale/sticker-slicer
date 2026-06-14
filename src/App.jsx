import { useState, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css';

function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  
  // Grid Setup
  const [cols, setCols] = useState(6);
  const [rows, setRows] = useState(5);
  
  // Visual Preview Controls (Percentages)
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [gridWidth, setGridWidth] = useState(100);
  const [gridHeight, setGridHeight] = useState(100);
  
  const imgRef = useRef(null);
  const MASTER_SCALE = 3; 

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setImageSrc(event.target.result);
      reader.readAsDataURL(file);
      
      // Reset grid adjustments when a new image is uploaded
      setOffsetX(0);
      setOffsetY(0);
      setGridWidth(100);
      setGridHeight(100);
      setZoom(1);
    }
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
    
    // Calculate the bounding box based on user's visual adjustments
    const startX = (offsetX / 100) * masterCanvas.width;
    const startY = (offsetY / 100) * masterCanvas.height;
    const totalW = (gridWidth / 100) * masterCanvas.width;
    const totalH = (gridHeight / 100) * masterCanvas.height;

    // Calculate individual cells within that specific bounding box
    const cellWidth = totalW / cols;
    const cellHeight = totalH / rows;
    
    let processedCount = 0;
    const totalStickers = rows * cols;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        processedCount++;
        setProgress(`Slicing sticker ${processedCount} of ${totalStickers}...`);

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = cellWidth;
        sliceCanvas.height = cellHeight;
        const sliceCtx = sliceCanvas.getContext('2d');
        
        sliceCtx.drawImage(
          masterCanvas,
          startX + (c * cellWidth), startY + (r * cellHeight), cellWidth, cellHeight,
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
      
      {/* File Upload */}
      <div style={{ marginBottom: '20px' }}>
        <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} />
      </div>

      {imageSrc && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          {/* Controls Panel */}
          <div style={{ 
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '20px', 
            padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '8px', marginBottom: '20px',
            maxWidth: '800px'
          }}>
            
            {/* Grid Layout */}
            <div style={{ borderRight: '2px solid #ccc', paddingRight: '20px' }}>
              <h4>Grid Layout</h4>
              <label>Cols: <input type="number" value={cols} onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '40px' }} /></label>
              <br/><br/>
              <label>Rows: <input type="number" value={rows} onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '40px' }} /></label>
            </div>

            {/* Position Adjustments */}
            <div style={{ borderRight: '2px solid #ccc', paddingRight: '20px' }}>
              <h4>Grid Position</h4>
              <label>X Offset: <input type="range" min="0" max="100" step="0.1" value={offsetX} onChange={(e) => setOffsetX(parseFloat(e.target.value))} /></label>
              <br/><br/>
              <label>Y Offset: <input type="range" min="0" max="100" step="0.1" value={offsetY} onChange={(e) => setOffsetY(parseFloat(e.target.value))} /></label>
            </div>

            {/* Size Adjustments */}
            <div style={{ borderRight: '2px solid #ccc', paddingRight: '20px' }}>
              <h4>Grid Size</h4>
              <label>Width: <input type="range" min="10" max="100" step="0.1" value={gridWidth} onChange={(e) => setGridWidth(parseFloat(e.target.value))} /></label>
              <br/><br/>
              <label>Height: <input type="range" min="10" max="100" step="0.1" value={gridHeight} onChange={(e) => setGridHeight(parseFloat(e.target.value))} /></label>
            </div>

            {/* Zoom Control */}
            <div>
              <h4>Preview Zoom</h4>
              <label>Zoom: <input type="range" min="0.5" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} /></label>
            </div>

          </div>

          {/* Interactive Preview Window */}
          <div style={{
            width: '100%', maxWidth: '900px', height: '500px', 
            overflow: 'auto', border: '2px solid #333', marginBottom: '20px',
            backgroundColor: '#e9ecef', position: 'relative'
          }}>
            <div style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              display: 'inline-block',
              position: 'relative'
            }}>
              
              {/* Background Image */}
              <img ref={imgRef} src={imageSrc} alt="Preview" style={{ display: 'block', maxWidth: '100%' }} />
              
              {/* Red Stitching Grid Overlay */}
              <div style={{
                position: 'absolute',
                top: `${offsetY}%`, left: `${offsetX}%`,
                width: `${gridWidth}%`, height: `${gridHeight}%`,
                pointerEvents: 'none' // Ensures you can scroll without catching the lines
              }}>
                {/* Draw Vertical Cut Lines */}
                {Array.from({ length: cols + 1 }).map((_, i) => (
                  <div key={`v-${i}`} style={{
                    position: 'absolute',
                    left: `${(i / cols) * 100}%`,
                    top: 0, bottom: 0,
                    borderLeft: '2px dashed red',
                    transform: 'translateX(-1px)' // Centers the dashed line
                  }} />
                ))}

                {/* Draw Horizontal Cut Lines */}
                {Array.from({ length: rows + 1 }).map((_, i) => (
                  <div key={`h-${i}`} style={{
                    position: 'absolute',
                    top: `${(i / rows) * 100}%`,
                    left: 0, right: 0,
                    borderTop: '2px dashed red',
                    transform: 'translateY(-1px)' // Centers the dashed line
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
              color: 'white', border: 'none', borderRadius: '4px', cursor: isProcessing ? 'not-allowed' : 'pointer'
            }}
          >
            {isProcessing ? 'Processing...' : 'Slice Based on Red Gridlines'}
          </button>
          
          {isProcessing && <p style={{ marginTop: '15px', fontWeight: 'bold', color: '#0056b3' }}>{progress}</p>}
        </div>
      )}
    </div>
  );
}

export default App;
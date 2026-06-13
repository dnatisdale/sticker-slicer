import { useState, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css';

function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  
  const [cols, setCols] = useState(6);
  const [rows, setRows] = useState(5);
  
  const imgRef = useRef(null);
  const MASTER_SCALE = 3; 

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setImageSrc(event.target.result);
      reader.readAsDataURL(file);
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
    
    // Generate one timestamp to use for both the ZIP and the internal files
    const timestamp = getTimestamp();

    const masterCanvas = document.createElement('canvas');
    masterCanvas.width = img.naturalWidth * MASTER_SCALE;
    masterCanvas.height = img.naturalHeight * MASTER_SCALE;
    
    const masterCtx = masterCanvas.getContext('2d');
    masterCtx.imageSmoothingEnabled = true;
    masterCtx.imageSmoothingQuality = 'high';
    masterCtx.drawImage(img, 0, 0, masterCanvas.width, masterCanvas.height);
    
    const cellWidth = masterCanvas.width / cols;
    const cellHeight = masterCanvas.height / rows;
    
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
          c * cellWidth, r * cellHeight, cellWidth, cellHeight,
          0, 0, cellWidth, cellHeight
        );

        const croppedCanvas = trimCanvasEdges(sliceCanvas);
        
        if (croppedCanvas) {
          const rowNum = String(r + 1).padStart(2, '0');
          const colNum = String(c + 1).padStart(2, '0');
          
          // New simplified filename format
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
      
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '8px', display: 'inline-block' }}>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ marginRight: '10px', fontWeight: 'bold' }}>Grid Columns:</label>
          <input 
            type="number" 
            value={cols} 
            onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))} 
            style={{ width: '60px', padding: '5px' }}
          />
          
          <label style={{ marginLeft: '20px', marginRight: '10px', fontWeight: 'bold' }}>Grid Rows:</label>
          <input 
            type="number" 
            value={rows} 
            onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))} 
            style={{ width: '60px', padding: '5px' }}
          />
        </div>
        
        <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} style={{ marginTop: '10px' }} />
      </div>

      {imageSrc && (
        <div>
          <img 
            ref={imgRef} 
            src={imageSrc} 
            alt="Upload preview" 
            style={{ maxWidth: '100%', height: 'auto', marginBottom: '20px', border: '1px solid #ccc' }} 
          />
          <br />
          
          <button 
            onClick={processStickers} 
            disabled={isProcessing}
            style={{ 
              padding: '12px 24px', 
              fontSize: '16px', 
              backgroundColor: isProcessing ? '#cccccc' : '#007bff', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: isProcessing ? 'not-allowed' : 'pointer'
            }}
          >
            {isProcessing ? 'Processing...' : 'Download Sliced Stickers'}
          </button>
          
          {isProcessing && (
            <p style={{ marginTop: '15px', fontWeight: 'bold', color: '#0056b3' }}>
              {progress}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
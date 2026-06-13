import { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css'; 

function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const imgRef = useRef(null);

  // Grid configuration
  const COLUMNS = 6;
  const ROWS = 5;
  
  // This multiplies the resolution of the entire image before slicing.
  // A scale of 3 means a 1000x1000 image becomes 3000x3000. 
  // Increase this number if you need even more pixels!
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
        // Treat near-white pixels as transparent for trimming purposes
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

    // Scale the padding so it remains proportional to the larger image
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

const getStickerText = async (canvas) => {
    try {
      // 1. Tell Tesseract to look for English AND Thai characters
      const result = await Tesseract.recognize(canvas, 'eng+tha');
      
      // 2. Clean up the text for the filename
      let safeText = result.data.text
        // Keep English letters, numbers, spaces, AND the Thai Unicode block (\u0E00-\u0E7F)
        .replace(/[^a-zA-Z0-9\s\u0E00-\u0E7F]/g, '') 
        .trim()
        .replace(/\s+/g, '_'); 
      
      // Keep filenames from getting absurdly long
      if (safeText.length > 30) safeText = safeText.substring(0, 30); 
      
      return safeText ? safeText : "sticker";
    } catch (error) {
      console.error("OCR Failed", error);
      return "sticker";
    }
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
    setProgress('Upscaling image...');
    
    const zip = new JSZip();
    const img = imgRef.current;

    // 1. Create a massive master canvas to increase the initial pixels
    const masterCanvas = document.createElement('canvas');
    masterCanvas.width = img.naturalWidth * MASTER_SCALE;
    masterCanvas.height = img.naturalHeight * MASTER_SCALE;
    
    const masterCtx = masterCanvas.getContext('2d');
    // Turn on high-quality smoothing so the upscale looks nice
    masterCtx.imageSmoothingEnabled = true;
    masterCtx.imageSmoothingQuality = 'high';
    masterCtx.drawImage(img, 0, 0, masterCanvas.width, masterCanvas.height);
    
    // Calculate cells based on the new massive canvas
    const cellWidth = masterCanvas.width / COLUMNS;
    const cellHeight = masterCanvas.height / ROWS;
    
    let processedCount = 0;
    const totalStickers = ROWS * COLUMNS;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLUMNS; c++) {
        processedCount++;
        setProgress(`Processing sticker ${processedCount} of ${totalStickers}...`);

        // 2. Get the rough slice from the upscaled master canvas
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = cellWidth;
        sliceCanvas.height = cellHeight;
        const sliceCtx = sliceCanvas.getContext('2d');
        
        sliceCtx.drawImage(
          masterCanvas,
          c * cellWidth, r * cellHeight, cellWidth, cellHeight,
          0, 0, cellWidth, cellHeight
        );

        // 3. Auto-crop the edges
        const croppedCanvas = trimCanvasEdges(sliceCanvas);
        
        if (croppedCanvas) {
          // 4. Read text
          const stickerText = await getStickerText(croppedCanvas);
          
          // 5. Build filename
          const rowNum = String(r + 1).padStart(2, '0');
          const colNum = String(c + 1).padStart(2, '0');
          const fileName = `r${rowNum}_c${colNum}_${stickerText}.png`;
          
          // 6. Add to ZIP
          const blob = await new Promise(resolve => croppedCanvas.toBlob(resolve, 'image/png'));
          zip.file(fileName, blob);
        }
      }
    }

    setProgress('Zipping files...');
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `Stickers_${getTimestamp()}.zip`);
    
    setIsProcessing(false);
    setProgress('');
  };

  return (
    <div className="App" style={{ textAlign: 'center', padding: '20px' }}>
      <h1>Sticker Slicer PWA</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} />
      </div>

      {imageSrc && (
        <div>
          <img 
            ref={imgRef} 
            src={imageSrc} 
            alt="Upload preview" 
            style={{ maxWidth: '100%', height: 'auto', marginBottom: '20px' }} 
          />
          <br />
          
          <button 
            onClick={processStickers} 
            disabled={isProcessing}
            style={{ padding: '10px 20px', fontSize: '16px' }}
          >
            {isProcessing ? 'Processing...' : 'Download Sliced Stickers'}
          </button>
          
          {isProcessing && (
            <p style={{ marginTop: '15px', fontWeight: 'bold', color: '#0056b3' }}>
              {progress} <br/>
              <small>(Reading text via OCR takes a moment!)</small>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
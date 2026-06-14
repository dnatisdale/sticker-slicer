import { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css';

const APP_VERSION = "2026-06-14_1715";

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
  const [draggingLine, setDraggingLine] = useState(null); 
  
  const [includeL, setIncludeL] = useState(true);
  const [includeM, setIncludeM] = useState(true);
  const [includeS, setIncludeS] = useState(true);

  // --- PWA Install State ---
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);

  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const MASTER_SCALE = 3; 

  // --- PWA Install Listener ---
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault(); 
      setDeferredPrompt(e); 
      setIsInstallable(true); 
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt(); 
    
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false); 
    }
    setDeferredPrompt(null);
  };

  // --- Input Fixes for Empty Strings ---
  const handleColsChange = (e) => {
    const val = e.target.value;
    if (val === '') {
      setCols('');
    } else {
      const newCols = parseInt(val, 10);
      setCols(newCols);
      if (newCols >= 1) setVLines(generateLines(newCols));
    }
  };

  const handleColsBlur = () => {
    if (cols === '' || cols < 1) {
      setCols(1);
      setVLines(generateLines(1));
    }
  };

  const handleRowsChange = (e) => {
    const val = e.target.value;
    if (val === '') {
      setRows('');
    } else {
      const newRows = parseInt(val, 10);
      setRows(newRows);
      if (newRows >= 1) setHLines(generateLines(newRows));
    }
  };

  const handleRowsBlur = () => {
    if (rows === '' || rows < 1) {
      setRows(1);
      setHLines(generateLines(1));
    }
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

  // --- Drag and Drop Logic (Mouse & Touch) ---
  const handleMouseDown = (e, type, index) => {
    e.preventDefault(); 
    setDraggingLine({ type, index });
  };

  const handleTouchStart = (e, type, index) => {
    setDraggingLine({ type, index });
  };

  useEffect(() => {
    const handleMove = (clientX, clientY) => {
      if (!draggingLine || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();

      if (draggingLine.type === 'v') {
        let pct = ((clientX - rect.left) / rect.width) * 100;
        pct = Math.max(0, Math.min(100, pct)); 
        const updated = [...vLines];
        updated[draggingLine.index] = pct;
        setVLines(updated);
      } else if (draggingLine.type === 'h') {
        let pct = ((clientY - rect.top) / rect.height) * 100;
        pct = Math.max(0, Math.min(100, pct)); 
        const updated = [...hLines];
        updated[draggingLine.index] = pct;
        setHLines(updated);
      }
    };

    const handleMouseMove = (e) => handleMove(e.clientX, e.clientY);
    
    const handleTouchMove = (e) => {
      if (e.cancelable) e.preventDefault(); // Stop mobile screen scrolling while dragging
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const handleMouseUp = () => setDraggingLine(null);
    const handleTouchEnd = () => setDraggingLine(null);

    if (draggingLine) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [draggingLine, vLines, hLines]);

  // --- Image Processing ---
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

  const getFormattedDate = () => {
    const now = new Date();
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const month = months[now.getMonth()];
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    return `${month}_${day}_${year}`;
  };

  const processStickers = async () => {
    if (!imgRef.current) return;
    
    setIsProcessing(true);
    setProgress('Upscaling, sizing, and slicing image...');
    
    const zip = new JSZip();
    const img = imgRef.current;
    const dateStamp = getFormattedDate();

    const targetSizes = [];
    if (includeL) targetSizes.push({ suffix: 'L', scale: 1.0 });
    if (includeM) targetSizes.push({ suffix: 'M', scale: 0.5 });
    if (includeS) targetSizes.push({ suffix: 'S', scale: 0.25 });

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
        setProgress(`Slicing & resizing sticker ${processedCount} of ${totalStickers}...`);

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
          
          for (const size of targetSizes) {
            const targetWidth = Math.max(1, croppedCanvas.width * size.scale);
            const targetHeight = Math.max(1, croppedCanvas.height * size.scale);
            
            const resizedCanvas = document.createElement('canvas');
            resizedCanvas.width = targetWidth;
            resizedCanvas.height = targetHeight;
            const ctx = resizedCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(croppedCanvas, 0, 0, targetWidth, targetHeight);

            const fileName = `r${rowNum}_c${colNum}_${dateStamp}_${size.suffix}.png`;
            const blob = await new Promise(resolve => resizedCanvas.toBlob(resolve, 'image/png'));
            
            zip.file(fileName, blob);
          }
        }
      }
    }

    setProgress('Zipping files...');
    const content = await zip.generateAsync({ type: "blob" });
    const defaultZipName = `Stickers_${dateStamp}.zip`;

    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultZipName,
          types: [{
            description: 'ZIP Archive',
            accept: { 'application/zip': ['.zip'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      } else {
        saveAs(content, defaultZipName);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('File save failed:', err);
        saveAs(content, defaultZipName); 
      }
    }
    
    setIsProcessing(false);
    setProgress('');
  };

  const noSizesSelected = !includeL && !includeM && !includeS;

  return (
    <div className="App" style={{ textAlign: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Sticker Slicer PWA</h1>

      {/* --- Install Button --- */}
      {isInstallable && (
        <button 
          onClick={handleInstallClick}
          style={{
            padding: '10px 20px', fontSize: '16px', fontWeight: 'bold',
            backgroundColor: '#28a745', color: 'white', border: 'none', 
            borderRadius: '20px', cursor: 'pointer', marginBottom: '20px',
            boxShadow: '0px 4px 6px rgba(0,0,0,0.1)'
          }}
        >
          📲 Install App to Device
        </button>
      )}
      
      <div style={{ marginBottom: '20px' }}>
        <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} />
      </div>

      {imageSrc && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          <div style={{ 
            display: 'flex', justifyContent: 'center', gap: '30px', 
            padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '8px', marginBottom: '20px',
          }}>
            <label><b>Columns:</b> <input type="number" value={cols} onChange={handleColsChange} onBlur={handleColsBlur} style={{ width: '50px' }} /></label>
            <label><b>Rows:</b> <input type="number" value={rows} onChange={handleRowsChange} onBlur={handleRowsBlur} style={{ width: '50px' }} /></label>
            <label><b>Zoom:</b> <input type="range" min="0.5" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ width: '100px' }}/></label>
          </div>

          <div style={{
            width: '100%', maxWidth: '1100px', height: '700px', 
            overflow: 'auto', border: '2px solid #333', marginBottom: '20px',
            backgroundColor: '#e9ecef', position: 'relative',
            cursor: draggingLine ? (draggingLine.type === 'v' ? 'col-resize' : 'row-resize') : 'default'
          }}>
            <div 
              ref={containerRef}
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                display: 'inline-block',
                position: 'relative',
                userSelect: 'none' 
              }}
            >
              <img ref={imgRef} src={imageSrc} alt="Preview" style={{ display: 'block', maxWidth: '100%', pointerEvents: 'none' }} />
              
              {vLines.map((pos, i) => (
                <div 
                  key={`v-line-${i}`} 
                  onMouseDown={(e) => handleMouseDown(e, 'v', i)}
                  onTouchStart={(e) => handleTouchStart(e, 'v', i)}
                  style={{
                    position: 'absolute', left: `calc(${pos}% - 7px)`, top: 0, bottom: 0,
                    width: '14px', cursor: 'col-resize', zIndex: 10,
                    display: 'flex', justifyContent: 'center', touchAction: 'none'
                  }} 
                >
                  <div style={{ width: '4px', height: '100%', borderLeft: '4px dashed rgba(255, 0, 0, 0.8)' }} />
                </div>
              ))}

              {hLines.map((pos, i) => (
                <div 
                  key={`h-line-${i}`} 
                  onMouseDown={(e) => handleMouseDown(e, 'h', i)}
                  onTouchStart={(e) => handleTouchStart(e, 'h', i)}
                  style={{
                    position: 'absolute', top: `calc(${pos}% - 7px)`, left: 0, right: 0,
                    height: '14px', cursor: 'row-resize', zIndex: 10,
                    display: 'flex', alignItems: 'center', touchAction: 'none'
                  }} 
                >
                  <div style={{ height: '4px', width: '100%', borderTop: '4px dashed rgba(255, 0, 0, 0.8)' }} />
                </div>
              ))}
            </div>
          </div>
          
          <div style={{ 
            marginBottom: '15px', padding: '10px 20px', backgroundColor: '#fff', 
            border: '1px solid #ccc', borderRadius: '6px', display: 'inline-block' 
          }}>
            <h4 style={{ margin: '0 0 10px 0' }}>Select Sizes to Export:</h4>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
              <label style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={includeL} onChange={(e) => setIncludeL(e.target.checked)} /> Large (100%)
              </label>
              <label style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={includeM} onChange={(e) => setIncludeM(e.target.checked)} /> Medium (50%)
              </label>
              <label style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={includeS} onChange={(e) => setIncludeS(e.target.checked)} /> Small (25%)
              </label>
            </div>
          </div>
          <br />

          <button 
            onClick={processStickers} 
            disabled={isProcessing || noSizesSelected}
            style={{ 
              padding: '12px 24px', fontSize: '16px', 
              backgroundColor: (isProcessing || noSizesSelected) ? '#cccccc' : '#007bff', 
              color: 'white', border: 'none', borderRadius: '4px', 
              cursor: (isProcessing || noSizesSelected) ? 'not-allowed' : 'pointer',
              marginBottom: '10px'
            }}
          >
            {isProcessing ? 'Processing...' : 'Slice and Save Zip'}
          </button>
          
          {noSizesSelected && <p style={{ margin: '0', color: 'red', fontSize: '14px' }}>Please select at least one size.</p>}
          {isProcessing && <p style={{ marginTop: '15px', fontWeight: 'bold', color: '#0056b3' }}>{progress}</p>}
        </div>
      )}
      
      <div style={{ marginTop: '40px', fontSize: '12px', color: '#888' }}>
        Version: {APP_VERSION}
      </div>
    </div>
  );
}

export default App;
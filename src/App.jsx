import { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css';

// A fallback dictionary for common English phrases to translate to Thai.
// If Tesseract reads something not on this list, it will just use the text it read!
const thaiTranslations = {
  "Merry Christmas": "สุขสันต์วันคริสต์มาส",
  "Happy Songkran": "สุขสันต์วันสงกรานต์",
  "555 laugh": "หัวเราะ_555",
  "Thank you": "ขอบคุณ",
  "Great job": "ทำได้ดีมาก",
  "Happy Birthday": "สุขสันต์วันเกิด",
  "OK": "ตกลง",
  "You Got It": "ได้เลย",
  "Lets do it": "ลุยเลย",
  "Roger that": "รับทราบ",
  "Understood": "เข้าใจแล้ว",
  "Excellent": "ยอดเยี่ยม",
  "Ha ha ha": "ฮ่าฮ่าฮ่า",
  "Oh no": "โอ้ไม่นะ",
  "Awesome": "สุดยอด",
  "I love it": "ฉันชอบมัน",
  "Hold on": "เดี๋ยวก่อน",
  "Let me think": "ขอคิดดูก่อน",
  "I really like it": "ฉันชอบมันมาก",
  "Take a break": "พักผ่อนบ้างนะ",
  "Lets go": "ไปกันเถอะ",
  "Keep it up": "พยายามต่อไปนะ",
  "Happy New Year": "สวัสดีปีใหม่",
  "Happy Chinese New Year": "สุขสันต์วันตรุษจีน",
  "Happy Valentines Day": "สุขสันต์วันวาเลนไทน์",
  "Happy Mothers Day": "สุขสันต์วันแม่",
  "Happy Fathers Day": "สุขสันต์วันพ่อ",
  "Congrats Graduate": "ขอแสดงความยินดีกับบัณฑิต",
  "Well done": "ทำได้ดีมาก",
  "You can do it": "คุณทำได้"
};

function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  
  // New State variables for dynamic rows and columns!
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

  const getStickerText = async (canvas) => {
    try {
      // Look for both English and Thai characters
      const result = await Tesseract.recognize(canvas, 'eng+tha');
      
      // Keep English letters, numbers, spaces, and Thai characters
      let rawText = result.data.text.replace(/[^a-zA-Z0-9\s\u0E00-\u0E7F]/g, '').trim();
      let finalName = rawText; 

      // Check if it matches our dictionary of known English phrases
      for (const [englishPhrase, thaiPhrase] of Object.entries(thaiTranslations)) {
        if (rawText.toLowerCase().includes(englishPhrase.toLowerCase().replace(/[^a-z0-9\s]/g, ''))) {
          finalName = thaiPhrase;
          break;
        }
      }

      // Final filename cleanup (replace spaces with underscores)
      let safeText = finalName.replace(/\s+/g, '_');
      
      // Keep names from getting absurdly long
      if (safeText.length > 30) safeText = safeText.substring(0, 30); 
      
      // If Tesseract completely fails to read anything, default to 'sticker'
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

    const masterCanvas = document.createElement('canvas');
    masterCanvas.width = img.naturalWidth * MASTER_SCALE;
    masterCanvas.height = img.naturalHeight * MASTER_SCALE;
    
    const masterCtx = masterCanvas.getContext('2d');
    masterCtx.imageSmoothingEnabled = true;
    masterCtx.imageSmoothingQuality = 'high';
    masterCtx.drawImage(img, 0, 0, masterCanvas.width, masterCanvas.height);
    
    // Calculate cells based on the dynamic rows and columns
    const cellWidth = masterCanvas.width / cols;
    const cellHeight = masterCanvas.height / rows;
    
    let processedCount = 0;
    const totalStickers = rows * cols;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        processedCount++;
        setProgress(`Scanning sticker ${processedCount} of ${totalStickers}...`);

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
          const stickerText = await getStickerText(croppedCanvas);
          
          const rowNum = String(r + 1).padStart(2, '0');
          const colNum = String(c + 1).padStart(2, '0');
          const fileName = `r${rowNum}_c${colNum}_${stickerText}.png`;
          
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
              {progress} <br/>
              <small>(OCR is analyzing the text... this will take a moment!)</small>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
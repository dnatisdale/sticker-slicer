import { useState, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css';

function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const imgRef = useRef(null);

  // Handle file upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setImageSrc(event.target.result);
      reader.readAsDataURL(file);
    }
  };

  // The Slicing Engine
  const processImage = async () => {
    if (!imgRef.current) return;
    setIsProcessing(true);

    const img = imgRef.current;
    const zip = new JSZip();
    
    const rows = 5;
    const cols = 6;
    const cellWidth = img.naturalWidth / cols;
    const cellHeight = img.naturalHeight / rows;

    // Create a temporary canvas for cropping
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    let processedCount = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Base grid coordinates
        let left = c * cellWidth;
        let top = r * cellHeight;
        let right = (c + 1) * cellWidth;
        let bottom = (r + 1) * cellHeight;

        // Apply our refined asymmetric padding
        left += 5;
        right -= 5;
        top += 25;
        bottom -= 15;

        // Ensure boundaries don't break
        left = Math.max(0, left);
        top = Math.max(0, top);
        right = Math.min(img.naturalWidth, right);
        bottom = Math.min(img.naturalHeight, bottom);

        const cropWidth = right - left;
        const cropHeight = bottom - top;

        canvas.width = cropWidth;
        canvas.height = cropHeight;

        // Draw the specific cropped area to the canvas
        ctx.clearRect(0, 0, cropWidth, cropHeight);
        ctx.drawImage(
          img,
          left, top, cropWidth, cropHeight, // Source coordinates
          0, 0, cropWidth, cropHeight       // Destination coordinates
        );

        // Convert canvas to blob and add to zip
        await new Promise((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) {
              zip.file(`sticker_row${r + 1}_col${c + 1}.png`, blob);
            }
            resolve();
          }, 'image/png');
        });
        
        processedCount++;
      }
    }

    // Generate and download the zip
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'stickers_collection.zip');
    setIsProcessing(false);
  };

  return (
    <div className="App">
      <h1>Sticker Slicer PWA</h1>
      
      <div className="upload-section">
        <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} />
      </div>

      {imageSrc && (
        <div className="preview-section">
          <img 
            ref={imgRef} 
            src={imageSrc} 
            alt="Upload preview" 
            style={{ maxWidth: '100%', marginTop: '20px', borderRadius: '8px' }} 
          />
          <br />
          <button 
            onClick={processImage} 
            disabled={isProcessing}
            style={{ marginTop: '20px', padding: '10px 20px', fontSize: '16px' }}
          >
            {isProcessing ? 'Slicing & Zipping...' : 'Download Sliced Stickers'}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
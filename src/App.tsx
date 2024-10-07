import { useCallback, useState } from 'react'
import {Buffer} from 'exceljs';
import {useDropzone} from 'react-dropzone'
import { fromEventimReport, writeWorkbook } from './eventim'

import './App.css'
type DownloadFileProps = {
  buffer: ArrayBuffer;   // The buffer you already have
  fileName: string;      // The name of the file to be downloaded
  mimeType: string;      // MIME type of the file (e.g., 'application/pdf')
};

export const DownloadFile: React.FC<DownloadFileProps> = ({ buffer, fileName, mimeType }) => {
  const handleDownload = () => {
    const blob = new Blob([buffer], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <button onClick={handleDownload}>
      Download {fileName}
    </button>
  );
};

function App() {
  const [workbook, setWorkbook] = useState<Buffer>();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const raw = reader.result;
        if (raw !== null && typeof raw === 'string') {
            const report = fromEventimReport(raw);
            writeWorkbook(report).then(setWorkbook)
        }
      }
      reader.readAsText(file);
    })
  }, [])

  const {getRootProps, getInputProps} = useDropzone({onDrop})

  return (
    <main>
        <div className="upload" {...getRootProps()}>
          <input {...getInputProps()} />
          <p>Click To Upload File</p>
        </div>
    {!!workbook && <DownloadFile buffer={workbook} fileName='report.xlsx' mimeType='application/vnd.ms-excel' /> }
    </main>
  )
}

export default App

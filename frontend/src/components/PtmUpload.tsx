import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";

interface Props {
  onUpload: (files: File[]) => void;
}

export default function PtmUpload({ onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      onUpload(Array.from(fileList));
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div
      className={`pixel-dropzone${dragActive ? " pixel-dropzone-active" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      <Upload className="mx-auto mb-2"
        style={{ width: 24, height: 24, color: "var(--color-muted-foreground)" }} />

      <p style={{ fontFamily: "var(--font-pixel-body)", fontSize: "1rem" }}>
        Drop msms.txt + *.mgf files here
      </p>

      <p style={{ fontSize: "0.85rem", color: "var(--color-muted-foreground)", marginTop: "0.25rem" }}>
        Required: msms.txt (with PTM) + .mgf &nbsp;|&nbsp; Optional: Phospho(STY)Sites.txt
      </p>

      <input ref={inputRef} type="file" multiple
        accept=".txt,.mgf,.gz"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)} />
    </div>
  );
}

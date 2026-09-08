import { useRef, useState } from "react";
import { UploadCloud, X, FileSpreadsheet } from "lucide-react";
export function Upload({
  file,
  onFile,
  disabled = false,
  label = "Upload Dataset",
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  function choose(next?: File) {
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a .csv file.");
      return;
    }
    if (next.size > 100 * 1024 * 1024) {
      setError("The file exceeds 100 MB.");
      return;
    }
    if (!next.size) {
      setError("The file is empty.");
      return;
    }
    setError("");
    onFile(next);
  }
  return (
    <section
      className={`upload-box ${over ? "drag-over" : ""}`}
      aria-label={label}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) choose(e.dataTransfer.files[0]);
      }}
    >
      <div className="panel-heading">
        <span>{label}</span>
        <UploadCloud size={17} />
      </div>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        aria-label={label}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        className="drop-target"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <FileSpreadsheet size={24} />
        <span>{file ? file.name : "Drop your CSV file here or browse"}</span>
        <small>
          {file
            ? `${(file.size / 1024).toFixed(1)} KB · Ready to analyze`
            : "Supports CSV files up to 100 MB."}
        </small>
      </button>
      {file && (
        <button
          className="text-button"
          disabled={disabled}
          onClick={() => onFile(null)}
        >
          <X size={14} />
          Remove selected file
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

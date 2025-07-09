import React, { useRef, useState, useEffect } from "react";

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (file: File) => void;
  currentImageUrl?: string;
  loading?: boolean;
  onDeleteImage?: () => void;
}

export default function ImageEditModal({
  isOpen,
  onClose,
  onSave,
  currentImageUrl,
  loading = false,
  onDeleteImage,
}: ImageEditModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wasLoading, setWasLoading] = useState(false);

  // Reset modal state on open/close
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setError(null);
    }
  }, [isOpen]);

  // Cerrar modal automáticamente al terminar de guardar
  useEffect(() => {
    if (wasLoading && !loading) {
      onClose();
    }
    setWasLoading(loading);
  }, [loading, wasLoading, onClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Solo se permiten archivos de imagen.");
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }
    setError(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = () => {
    if (!selectedFile) {
      setError("Selecciona una imagen válida.");
      return;
    }
    setError(null);
    onSave(selectedFile);
  };

  // Animación: solo lateral en desktop, solo desde abajo en mobile
  // Usamos Tailwind para clases responsivas y transiciones
  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-end sm:items-center justify-center
        ${isOpen ? "pointer-events-auto" : "pointer-events-none"}
      `}
      aria-modal="true"
      role="dialog"
    >
      {/* Fondo oscuro */}
      <div
        className={`
          fixed inset-0 bg-black bg-opacity-40 transition-opacity duration-300
          ${isOpen ? "opacity-100" : "opacity-0"}
        `}
        onClick={onClose}
      />
      {/* Modal */}
      <div
        className={`
          bg-white shadow-xl rounded-t-2xl sm:rounded-l-2xl sm:rounded-tr-none
          w-full sm:w-[40vw] max-w-lg
          h-[70vh] sm:h-full
          fixed bottom-0 sm:bottom-auto sm:top-0 sm:right-0
          transition-transform duration-400 ease-in-out
          ${isOpen
            ? "translate-y-0 sm:translate-x-0"
            : "translate-y-full sm:translate-x-full sm:translate-y-0"
          }
          flex flex-col
        `}
        style={{
          right: 0,
          boxShadow: "0 0 40px 0 rgba(0,0,0,0.15)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Editar Imagen</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 p-6 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Selecciona una imagen</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-[#D727FF] file:text-white hover:file:bg-[#b81fc7]"
              disabled={loading}
            />
            {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
          </div>
          {/* Preview */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-gray-500">Preview:</span>
            <div className="relative w-40 h-40 bg-gray-100 border border-gray-200 rounded flex items-center justify-center overflow-hidden">
              {/* Botón eliminar imagen */}
              {currentImageUrl && !previewUrl && onDeleteImage && (
                <button
                  type="button"
                  onClick={onDeleteImage}
                  className="absolute top-2 right-2 z-20 w-6 h-6 flex items-center justify-center rounded-full bg-white bg-opacity-80 hover:bg-red-500 hover:text-white text-gray-500 shadow transition"
                  title="Eliminar imagen"
                  disabled={loading}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="object-contain w-full h-full" />
              ) : currentImageUrl ? (
                <img src={currentImageUrl} alt="Actual" className="object-contain w-full h-full" />
              ) : (
                <span className="text-gray-400 text-xs">Sin imagen</span>
              )}
            </div>
          </div>
        </div>
        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded text-sm font-medium hover:bg-gray-50 transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-[#D727FF] text-white rounded text-sm font-medium hover:bg-[#b81fc7] transition-colors"
            disabled={loading}
          >
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
} 
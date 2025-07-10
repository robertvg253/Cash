import { LoaderFunctionArgs, ActionFunctionArgs, json, unstable_createMemoryUploadHandler, unstable_parseMultipartFormData, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { useState, useEffect, useCallback } from "react";
import { requireUser } from "../utils/session.server";
import { supabase } from "../supabase.server";
import ImageEditModal from "../components/ImageEditModal";
import React from "react";
import { getColorHex } from "../utils/colorUtils";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  // Obtener todos los productos
  const { data: products, error } = await supabase
    .from("products")
    .select("id, title, color, image_url");
  return json({ products: products || [], error: error?.message });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const uploadHandler = unstable_createMemoryUploadHandler({
    maxPartSize: 5_000_000, // 5MB
  });
  const formData = await unstable_parseMultipartFormData(request, uploadHandler);
  const productId = formData.get("productId");
  const file = formData.get("image");
  const deleteImage = formData.get("deleteImage");

  if (!productId || typeof productId !== "string") {
    return json({ error: "Datos inválidos." }, { status: 400 });
  }
  if (deleteImage) {
    // Borrar la URL de la imagen en la base de datos
    const { error: updateError } = await supabase
      .from("products")
      .update({ image_url: null })
      .eq("id", productId);
    if (updateError) {
      return json({ error: updateError.message }, { status: 500 });
    }
    return redirect("/catalogo");
  }

  if (!file || !(file instanceof File)) {
    return json({ error: "Datos inválidos." }, { status: 400 });
  }

  // Subir imagen a Supabase Storage
  const fileExt = file.name.split('.').pop();
  const filePath = `product-${productId}-${Date.now()}.${fileExt}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });
  if (uploadError) {
    return json({ error: uploadError.message }, { status: 500 });
  }

  // Obtener URL pública
  const { data: publicUrlData } = supabase.storage
    .from("product-images")
    .getPublicUrl(filePath);
  const publicUrl = publicUrlData?.publicUrl;

  // Actualizar producto en la base de datos
  const { error: updateError } = await supabase
    .from("products")
    .update({ image_url: publicUrl })
    .eq("id", productId);
  if (updateError) {
    return json({ error: updateError.message }, { status: 500 });
  }

  return redirect("/catalogo");
}

// Debounce para los filtros (igual que en Inventario)
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export default function Catalogo() {
  const { products, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  // Barra de búsqueda y filtro de color (igual que Inventario)
  const [searchValue, setSearchValue] = useState("");
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);
  const [searchParams, setSearchParams] = useState(new URLSearchParams());
  // Debounce para los filtros
  const debouncedSearch = useDebounce(searchValue, 300);
  const debouncedColor = useDebounce(selectedColor, 300);
  // Efecto para actualizar la URL cuando cambien los filtros debounced
  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    if (debouncedSearch) {
      newSearchParams.set('search', debouncedSearch);
    } else {
      newSearchParams.delete('search');
    }
    if (debouncedColor) {
      newSearchParams.set('color', debouncedColor);
    } else {
      newSearchParams.delete('color');
    }
    const currentSearch = searchParams.get('search') || '';
    const currentColor = searchParams.get('color') || '';
    if (debouncedSearch !== currentSearch || debouncedColor !== currentColor) {
      navigate(`?${newSearchParams.toString()}`, { replace: true });
    }
  }, [debouncedSearch, debouncedColor, searchParams, navigate]);
  const handleClearFilters = useCallback(() => {
    setSearchValue('');
    setSelectedColor(undefined);
    navigate('/catalogo', { replace: true });
  }, [navigate]);

  const handleOpenModal = (product: any) => {
    setSelectedProduct(product);
    setModalOpen(true);
  };
  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedProduct(null);
    setDeleting(false);
  };
  const handleSaveImage = (file: File) => {
    if (!selectedProduct) return;
    const formData = new FormData();
    formData.append("productId", selectedProduct.id);
    formData.append("image", file);
    fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
  };
  const handleDeleteImage = () => {
    if (!selectedProduct) return;
    setDeleting(true);
    const formData = new FormData();
    formData.append("productId", selectedProduct.id);
    formData.append("deleteImage", "1");
    fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
  };

  // Cerrar modal automáticamente tras eliminar
  React.useEffect(() => {
    if (deleting && fetcher.state === 'idle') {
      handleCloseModal();
    }
  }, [deleting, fetcher.state]);

  return (
    <div className="min-h-screen bg-gray-50 w-full flex flex-col items-stretch overflow-x-hidden">
      <div className="w-full sm:max-w-7xl sm:mx-auto px-2 pt-16 pb-4 sm:p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Catálogo</h1>
        {error && <div className="text-red-500 mb-4">{error}</div>}
        {/* Barra de búsqueda y filtrado arriba, igual que Inventario */}
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200 mb-4 sm:mb-6 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 w-full">
            {/* Búsqueda General */}
            <div className="flex-1">
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Buscar Producto (Ej: downline 1039)"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none bg-white text-gray-900 h-10"
              />
            </div>
            {/* Filtro Color */}
            <div className="flex items-center gap-2 mt-2 sm:mt-0">
              <select
                value={selectedColor || ''}
                onChange={e => setSelectedColor(e.target.value || undefined)}
                className="px-3 py-2 border border-gray-300 rounded text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none bg-white text-gray-900 h-10"
                style={{ minWidth: 180 }}
              >
                <option value="">Todos los colores</option>
                {[...new Set(products.map((p: any) => p.color).filter(Boolean))].map((color: string) => (
                  <option key={color} value={color}>{color}</option>
                ))}
              </select>
              <span className="inline-block w-8 h-8 rounded border border-gray-300 transition-colors duration-200 align-middle" style={{ backgroundColor: selectedColor ? getColorHex(selectedColor) : 'transparent' }} />
            </div>
            {/* Botón Limpiar */}
            <div className="flex items-center mt-2 sm:mt-0">
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-4 h-10 bg-gray-200 text-gray-700 text-sm font-medium rounded hover:bg-gray-300 transition"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>
        {/* Lista de productos en mobile (cards apiladas) */}
        <div className="block sm:hidden">
          <div className="space-y-4">
            {products.filter((p: any) => (!selectedColor || p.color === selectedColor) && (!searchValue || p.title?.toLowerCase().includes(searchValue.toLowerCase()))).map((product: any) => (
              <div key={product.id} className="flex w-full items-stretch bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                {/* Columna izquierda: nombre y color (75%) */}
                <div className="flex-[3] flex flex-col justify-center p-3 min-w-0">
                  <div className="font-medium text-gray-900 text-sm mb-1 break-words whitespace-normal">{product.title || 'Sin título'}</div>
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-4 h-4 rounded border border-gray-300"
                      style={{
                        backgroundColor: getColorHex(product.color),
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)'
                      }}
                    />
                    <span
                      className="text-xs font-medium break-words whitespace-normal"
                      style={{ color: product.color || undefined }}
                    >
                      {product.color || 'Sin color'}
                    </span>
                  </div>
                </div>
                {/* Miniatura con overlay de lápiz (25%) */}
                <div className="relative flex-[1] w-20 h-20 flex-shrink-0 flex items-center justify-center cursor-pointer group" onClick={() => handleOpenModal(product)}>
                  <div className="absolute inset-0 bg-black bg-opacity-30 group-hover:bg-opacity-50 transition rounded flex items-center justify-center z-10" />
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.title} className="object-contain w-full h-full z-0" />
                  ) : (
                    <span className="text-gray-400 text-xs flex items-center justify-center w-full h-full text-center z-0">Sin imagen</span>
                  )}
                  {/* Lápiz overlay */}
                  <div className="absolute inset-0 flex items-center justify-center z-20">
                    <svg className="w-7 h-7 text-white opacity-90" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-2.828 0L9 13zm-6 6h6v-2a2 2 0 012-2h2a2 2 0 012 2v2h6" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Tabla en desktop */}
        <div className="hidden sm:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Imagen</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Color</th>
                  <th className="px-3 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Editar</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.filter((p: any) => (!selectedColor || p.color === selectedColor) && (!searchValue || p.title?.toLowerCase().includes(searchValue.toLowerCase()))).map((product: any) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    {/* Miniatura */}
                    <td className="px-3 sm:px-6 py-3">
                      <div className="w-14 h-14 bg-gray-100 border border-gray-200 rounded flex items-center justify-center overflow-hidden">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.title} className="object-contain w-full h-full" />
                        ) : (
                          <span className="text-gray-400 text-xs flex items-center justify-center w-full h-full text-center">Sin imagen</span>
                        )}
                      </div>
                    </td>
                    {/* Nombre */}
                    <td className="px-3 sm:px-6 py-3 text-sm text-gray-900 max-w-[180px] truncate">
                      {product.title || 'Sin título'}
                    </td>
                    {/* Color */}
                    <td className="px-3 sm:px-6 py-3 text-sm text-gray-900">
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: getColorHex(product.color), boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }} />
                        <span
                          className="max-w-[80px] sm:max-w-none truncate font-medium"
                          style={{ color: product.color || undefined }}
                        >
                          {product.color || 'Sin color'}
                        </span>
                      </div>
                    </td>
                    {/* Botón Editar */}
                    <td className="px-3 sm:px-6 py-3 text-center">
                      <button
                        onClick={() => handleOpenModal(product)}
                        className="px-4 py-2 bg-[#D727FF] text-white text-xs font-semibold rounded hover:bg-[#b81fc7] transition whitespace-nowrap leading-tight"
                        style={{ minWidth: 0 }}
                      >
                        Editar imagen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <ImageEditModal
          isOpen={modalOpen}
          onClose={handleCloseModal}
          onSave={handleSaveImage}
          currentImageUrl={selectedProduct?.image_url}
          loading={fetcher.state === "submitting"}
          onDeleteImage={handleDeleteImage}
        />
      </div>
    </div>
  );
} 
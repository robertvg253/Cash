import { LoaderFunctionArgs, ActionFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator, useSearchParams, useNavigate } from "@remix-run/react";
import { useState, useEffect, useCallback } from "react";
import { requireUser } from "../utils/session.server";
import { supabase } from "../supabase.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const color = url.searchParams.get("color") || "";

  // Primero obtener todos los productos con filtros
  let productsQuery = supabase
    .from('products')
    .select('id, title, color')
    .order('title');

  if (search) {
    productsQuery = productsQuery.ilike('title', `%${search}%`);
  }
  if (color) {
    productsQuery = productsQuery.eq('color', color);
  }

  const { data: products, error: productsError } = await productsQuery;

  if (productsError) {
    console.error('Error fetching products:', productsError);
    return json({ 
      products: [], 
      filters: { colores: [] },
      currentFilters: { search, color },
      error: productsError.message 
    });
  }

  // Obtener todos los registros de inventario
  const { data: inventarioData, error: inventarioError } = await supabase
    .from('inventario')
    .select('product_id, cantidad');

  if (inventarioError) {
    console.error('Error fetching inventario:', inventarioError);
    return json({ 
      products: [], 
      filters: { colores: [] },
      currentFilters: { search, color },
      error: inventarioError.message 
    });
  }

  // Crear un mapa de product_id -> cantidad para acceso rápido
  const inventarioMap = new Map();
  inventarioData?.forEach(item => {
    inventarioMap.set(item.product_id, item.cantidad);
  });

  // Combinar productos con sus cantidades
  const transformedProducts = products?.map(product => ({
    id: product.id,
    title: product.title,
    color: product.color,
    cantidad: inventarioMap.get(product.id) || 0
  })) || [];

  // Obtener valores únicos para filtros
  const { data: colores } = await supabase.from('products').select('color').not('color', 'is', null);
  const uniqueColores = [...new Set(colores?.map(c => c.color) || [])];

  return json({ 
    products: transformedProducts, 
    filters: { colores: uniqueColores },
    currentFilters: { search, color }
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  
  const formData = await request.formData();
  const productId = formData.get("productId");
  const newCantidad = formData.get("cantidad");

  if (productId && newCantidad !== null) {
    const cantidad = parseInt(newCantidad.toString());
    
    // Actualizar o insertar en la tabla inventario
    const { error } = await supabase
      .from('inventario')
      .upsert({ 
        product_id: parseInt(productId.toString()), 
        cantidad: cantidad,
        updated_at: new Date().toISOString()
      });

    if (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  return json({ success: true });
}

// Hook personalizado para debounce
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

export default function Inventario() {
  const { products, filters, currentFilters } = useLoaderData<typeof loader>();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [pendingChanges, setPendingChanges] = useState<{[key: number]: number}>({});
  const [searchValue, setSearchValue] = useState(currentFilters.search);
  const [colorValue, setColorValue] = useState(currentFilters.color);
  
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Debounce para los filtros
  const debouncedSearch = useDebounce(searchValue, 300);
  const debouncedColor = useDebounce(colorValue, 300);

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
    
    // Solo navegar si los parámetros realmente cambiaron
    const currentSearch = searchParams.get('search') || '';
    const currentColor = searchParams.get('color') || '';
    
    if (debouncedSearch !== currentSearch || debouncedColor !== currentColor) {
      navigate(`?${newSearchParams.toString()}`, { replace: true });
    }
  }, [debouncedSearch, debouncedColor, searchParams, navigate]);

  // Efecto para revalidar datos cuando se completa una acción
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && typeof fetcher.data === 'object' && 'success' in fetcher.data) {
      // Limpiar cambios pendientes después de guardar exitosamente
      setPendingChanges({});
      // Revalidar los datos para obtener la información más actualizada
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  const handleEdit = (product: any) => {
    setEditingId(product.id);
    setEditValue(product.cantidad?.toString() || "0");
  };

  const handleSave = (productId: number) => {
    fetcher.submit(
      { productId: productId.toString(), cantidad: editValue },
      { method: "post" }
    );
    setEditingId(null);
    setEditValue("");
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue("");
  };

  const handleQuickEdit = (productId: number, newValue: number) => {
    setPendingChanges(prev => ({
      ...prev,
      [productId]: newValue
    }));
  };

  const handleSaveAll = () => {
    // Guardar todos los cambios pendientes
    Object.entries(pendingChanges).forEach(([productId, cantidad]) => {
      fetcher.submit(
        { productId, cantidad: cantidad.toString() },
        { method: "post" }
      );
    });
  };

  const handleClearFilters = useCallback(() => {
    setSearchValue('');
    setColorValue('');
    navigate('/inventario', { replace: true });
  }, [navigate]);

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;
  const isSubmitting = fetcher.state === 'submitting';

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 space-y-2 sm:space-y-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Inventario</h1>
          {hasPendingChanges && (
            <button
              onClick={handleSaveAll}
              disabled={isSubmitting}
              className={`px-4 py-2 text-white text-sm font-medium rounded transition ${
                isSubmitting 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-[#D727FF] hover:bg-[#b81fc7]'
              }`}
            >
              {isSubmitting ? 'Guardando...' : `Guardar Cambios (${Object.keys(pendingChanges).length})`}
            </button>
          )}
        </div>
        
        {/* Filtros */}
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200 mb-4 sm:mb-6">
          <div className="space-y-4 sm:space-y-0 sm:grid sm:grid-cols-1 md:grid-cols-3 sm:gap-4">
            {/* Búsqueda General */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1 bg-white">Buscar Producto</label>
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Ej: downline 1039"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none bg-white text-gray-900"
              />
            </div>

            {/* Filtro Color */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1 bg-white">Color</label>
              <select
                value={colorValue}
                onChange={(e) => setColorValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none bg-white text-gray-900"
              >
                <option value="">Todos los colores</option>
                {filters.colores.map((color: string) => (
                  <option key={color} value={color}>{color}</option>
                ))}
              </select>
            </div>

            {/* Botón Limpiar */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded hover:bg-gray-300 transition"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nombre del Producto
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Color
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cantidad
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.map((product: any) => {
                  const pendingValue = pendingChanges[product.id];
                  const displayValue = pendingValue !== undefined ? pendingValue : product.cantidad;
                  const hasPendingChange = pendingValue !== undefined;
                  
                  return (
                    <tr key={product.id} className={`hover:bg-gray-50 ${hasPendingChange ? 'bg-yellow-50' : ''}`}>
                      <td className="px-3 sm:px-6 py-4 text-sm text-gray-900">
                        <div className="max-w-[200px] sm:max-w-none truncate">
                          {product.title || 'Sin título'}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 text-sm text-gray-900">
                        <div className="max-w-[100px] sm:max-w-none truncate">
                          {product.color || 'Sin color'}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 text-sm text-gray-900">
                        {editingId === product.id ? (
                          <div className="flex items-center space-x-1 sm:space-x-2">
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-16 sm:w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none bg-white text-gray-900"
                              min="0"
                            />
                            <button
                              onClick={() => handleSave(product.id)}
                              disabled={isSubmitting}
                              className={`text-sm font-medium p-1 ${
                                isSubmitting ? 'text-gray-400' : 'text-[#D727FF] hover:text-[#b81fc7]'
                              }`}
                            >
                              ✓
                            </button>
                            <button
                              onClick={handleCancel}
                              disabled={isSubmitting}
                              className={`text-sm font-medium p-1 ${
                                isSubmitting ? 'text-gray-400' : 'text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1 sm:space-x-2">
                            <div className="flex items-center space-x-1">
                              <input
                                type="number"
                                value={displayValue}
                                onChange={(e) => handleQuickEdit(product.id, parseInt(e.target.value) || 0)}
                                disabled={isSubmitting}
                                className={`w-16 sm:w-20 px-2 py-1 border rounded text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none bg-white text-gray-900 ${
                                  hasPendingChange ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'
                                } ${isSubmitting ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                min="0"
                              />
                              {hasPendingChange && (
                                <span className="text-yellow-600 text-xs">*</span>
                              )}
                            </div>
                            <button
                              onClick={() => handleEdit(product)}
                              disabled={isSubmitting}
                              className={`text-sm font-medium p-1 ${
                                isSubmitting ? 'text-gray-400' : 'text-[#D727FF] hover:text-[#b81fc7]'
                              }`}
                            >
                              ✏️
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {products.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No se encontraron productos con los filtros aplicados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 
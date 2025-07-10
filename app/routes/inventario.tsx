import { LoaderFunctionArgs, ActionFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator, useSearchParams, useNavigate } from "@remix-run/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { requireUser } from "../utils/session.server";
import { supabase } from "../supabase.server";
import { getColorHex } from "../utils/colorUtils";

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

// Modificar el action para aceptar un array de cambios
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const formData = await request.formData();
  const changesRaw = formData.get("changes");
  let changes: Array<{ productId: number, cantidad: number }> = [];
  try {
    changes = JSON.parse(changesRaw as string);
  } catch {
    // fallback para compatibilidad
    const productId = formData.get("productId");
    const newCantidad = formData.get("cantidad");
    if (productId && newCantidad !== null) {
      changes = [{ productId: parseInt(productId.toString()), cantidad: parseInt(newCantidad.toString()) }];
    }
  }
  for (const change of changes) {
    await supabase
      .from('inventario')
      .upsert({ 
        product_id: change.productId, 
        cantidad: change.cantidad,
        updated_at: new Date().toISOString()
      });
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

  const prevProductsRef = useRef<any[]>(products);

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
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  // 1. Estado local para los valores de cantidad de cada producto
  const [inputValues, setInputValues] = useState<{[key: number]: number}>({});

  // 2. Inicializar inputValues cada vez que los productos cambian, solo si no hay cambios pendientes
  useEffect(() => {
    if (Object.keys(pendingChanges).length === 0) {
      const initialValues: {[key: number]: number} = {};
      products.forEach((product: any) => {
        initialValues[product.id] = product.cantidad;
      });
      setInputValues(initialValues);
      setPendingChanges({});
      prevProductsRef.current = products;
    }
  }, [products]);

  // 3. Al escribir en el input, actualizar inputValues y pendingChanges
  const handleInputChange = (productId: number, newValue: number) => {
    setInputValues(prev => ({ ...prev, [productId]: newValue }));
    // Solo marcar como pendiente si el valor es diferente al original
    const original = products.find((p: any) => p.id === productId)?.cantidad;
    setPendingChanges(prev => {
      const updated = { ...prev };
      if (newValue !== original) {
        updated[productId] = newValue;
      } else {
        delete updated[productId];
      }
      return updated;
    });
  };

  // 4. Al guardar, solo enviar los cambios respecto a los productos originales
  // Modificar handleSaveAll para enviar todos los cambios juntos
  const handleSaveAll = () => {
    const changesArr = Object.entries(pendingChanges).map(([productId, cantidad]) => ({
      productId: parseInt(productId),
      cantidad: cantidad as number
    }));
    const formData = new FormData();
    formData.append("changes", JSON.stringify(changesArr));
    fetcher.submit(formData, { method: "post" });
  };

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

  const handleClearFilters = useCallback(() => {
    setSearchValue('');
    setColorValue('');
    navigate('/inventario', { replace: true });
  }, [navigate]);

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;
  const isSubmitting = fetcher.state === 'submitting';

  // Efecto para limpiar pendingChanges y reinicializar inputValues tras guardar exitosamente
  const prevIsSubmitting = useRef(isSubmitting);
  useEffect(() => {
    if (
      prevIsSubmitting.current &&
      !isSubmitting &&
      fetcher.data &&
      typeof fetcher.data === 'object' &&
      'success' in fetcher.data &&
      fetcher.data.success
    ) {
      const initialValues: {[key: number]: number} = {};
      products.forEach((product: any) => {
        initialValues[product.id] = product.cantidad;
      });
      setInputValues(initialValues);
      setPendingChanges({});
    }
    prevIsSubmitting.current = isSubmitting;
  }, [isSubmitting, fetcher.data, products]);

  return (
    <div className="min-h-screen bg-gray-50 w-full flex flex-col items-stretch overflow-x-hidden">
      <div className="w-full sm:max-w-7xl sm:mx-auto px-2 pt-16 pb-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 space-y-2 sm:space-y-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Inventario</h1>
        </div>
        
        {/* Filtros */}
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
                value={colorValue}
                onChange={(e) => setColorValue(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none bg-white text-gray-900 h-10"
                style={{ minWidth: 180 }}
              >
                <option value="">Todos los colores</option>
                {filters.colores.map((color: string) => (
                  <option key={color} value={color}>{color}</option>
                ))}
              </select>
              <span
                className="inline-block w-8 h-8 rounded border border-gray-300 transition-colors duration-200 align-middle"
                style={{ backgroundColor: colorValue ? getColorHex(colorValue) : 'transparent' }}
              />
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

        {/* Cards en mobile, tabla en desktop */}
        <div className="block sm:hidden">
          <div className="space-y-4">
            {products.map((product: any) => {
              const pendingValue = pendingChanges[product.id];
              const displayValue = pendingValue !== undefined ? pendingValue : product.cantidad;
              const hasPendingChange = pendingValue !== undefined;
              return (
                <div key={product.id} className="flex w-full items-stretch bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="flex-1 flex flex-col justify-center p-3 min-w-0">
                    <div className="font-medium text-gray-900 text-sm mb-1 break-words whitespace-normal">{product.title || 'Sin título'}</div>
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: product.color?.startsWith('#') ? product.color : '#CCCCCC', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }} />
                      <span className="text-xs font-medium break-words whitespace-normal" style={{ color: product.color?.startsWith('#') ? product.color : undefined }}>{product.color || 'Sin color'}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <label className="text-xs text-gray-500">Cantidad:</label>
                      <input
                        type="number"
                        value={inputValues[product.id] ?? product.cantidad}
                        onChange={e => handleInputChange(product.id, parseInt(e.target.value) || 0)}
                        disabled={isSubmitting}
                        className={`w-16 px-2 py-1 border rounded text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none bg-white text-gray-900 ${hasPendingChange ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'} ${isSubmitting ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        min="0"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Tabla en desktop */}
        <div className="hidden sm:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden w-full">
          <div className="sm:overflow-x-auto">
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
                        <input
                          type="number"
                          value={inputValues[product.id] ?? product.cantidad}
                          onChange={e => handleInputChange(product.id, parseInt(e.target.value) || 0)}
                          disabled={isSubmitting}
                          className={`w-16 sm:w-20 px-2 py-1 border rounded text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none bg-white text-gray-900 ${hasPendingChange ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'}`}
                          min="0"
                        />
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
        {/* Modal flotante para guardar/cancelar cambios pendientes */}
        {hasPendingChanges && (
          <div
            className="fixed bottom-6 right-6 z-50 bg-white shadow-lg border border-gray-200 px-6 py-4 flex items-center gap-4 rounded-[25px]"
            style={{ minWidth: 240 }}
          >
            <button
              onClick={handleSaveAll}
              disabled={isSubmitting}
              className={`px-4 py-2 text-white text-sm font-semibold rounded-[18px] transition ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#D727FF] hover:bg-[#b81fc7]'}`}
            >
              {isSubmitting ? 'Guardando...' : `Guardar Cambios (${Object.keys(pendingChanges).length})`}
            </button>
            <button
              onClick={() => setPendingChanges({})}
              disabled={isSubmitting}
              className={`px-4 py-2 text-sm font-semibold rounded-[18px] transition ${isSubmitting ? 'bg-gray-200 cursor-not-allowed' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
} 
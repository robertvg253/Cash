import { LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useSearchParams, useNavigate } from "@remix-run/react";
import { useState, useEffect, useCallback } from "react";
import { requireUser } from "../utils/session.server";
import { supabase } from "../supabase.server";
import { getColorHex } from "../utils/colorUtils";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const category = url.searchParams.get("category") || "";

  // Obtener productos con filtros
  let productsQuery = supabase
    .from('products')
    .select('*')
    .order('title');

  if (search) {
    productsQuery = productsQuery.ilike('title', `%${search}%`);
  }
  if (category) {
    productsQuery = productsQuery.eq('category', category);
  }

  const { data: products, error: productsError } = await productsQuery;

  if (productsError) {
    console.error('Error fetching products:', productsError);
    return json({ 
      products: [], 
      filters: { categories: [] },
      currentFilters: { search, category },
      error: productsError.message 
    });
  }

  // Obtener categorías únicas para filtros
  const { data: categories } = await supabase
    .from('products')
    .select('category')
    .not('category', 'is', null);
  
  const uniqueCategories = [...new Set(categories?.map(c => c.category) || [])];

  return json({ 
    products: products || [], 
    filters: { categories: uniqueCategories },
    currentFilters: { search, category }
  });
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

export default function Productos() {
  const { products, filters, currentFilters } = useLoaderData<typeof loader>();
  const [searchValue, setSearchValue] = useState(currentFilters.search);
  const [categoryValue, setCategoryValue] = useState(currentFilters.category);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Debounce para los filtros
  const debouncedSearch = useDebounce(searchValue, 300);
  const debouncedCategory = useDebounce(categoryValue, 300);

  // Efecto para actualizar la URL cuando cambien los filtros debounced
  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    
    if (debouncedSearch) {
      newSearchParams.set('search', debouncedSearch);
    } else {
      newSearchParams.delete('search');
    }
    
    if (debouncedCategory) {
      newSearchParams.set('category', debouncedCategory);
    } else {
      newSearchParams.delete('category');
    }
    
    // Solo navegar si los parámetros realmente cambiaron
    const currentSearch = searchParams.get('search') || '';
    const currentCategory = searchParams.get('category') || '';
    
    if (debouncedSearch !== currentSearch || debouncedCategory !== currentCategory) {
      navigate(`?${newSearchParams.toString()}`, { replace: true });
    }
  }, [debouncedSearch, debouncedCategory, searchParams, navigate]);

  const handleClearFilters = useCallback(() => {
    setSearchValue('');
    setCategoryValue('');
    navigate('/productos', { replace: true });
  }, [navigate]);

  // Agregar filtro visual de color arriba de la tabla:
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 pt-16 sm:pt-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 space-y-2 sm:space-y-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Productos</h1>
          <div className="text-sm text-gray-600">
            {products.length} producto{products.length !== 1 ? 's' : ''} encontrado{products.length !== 1 ? 's' : ''}
          </div>
        </div>
        
        {/* Filtros */}
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200 mb-4 sm:mb-6">
          <div className="space-y-4 sm:space-y-0 sm:grid sm:grid-cols-1 md:grid-cols-4 sm:gap-4">
            {/* Búsqueda */}
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

            {/* Filtro Categoría */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1 bg-white">Categoría</label>
              <select
                value={categoryValue}
                onChange={(e) => setCategoryValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none bg-white text-gray-900"
              >
                <option value="">Todas las categorías</option>
                {filters.categories.map((category: string) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Filtro Color */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1 bg-white">Color</label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedColor || ''}
                  onChange={e => setSelectedColor(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none bg-white text-gray-900"
                >
                  <option value="">Todos los colores</option>
                  {[...new Set(products.map((p: any) => p.color).filter(Boolean))].map((color: string) => (
                    <option key={color} value={color}>{color}</option>
                  ))}
                </select>
                {selectedColor && (
                  <span className="inline-block w-5 h-5 rounded border border-gray-300" style={{ backgroundColor: getColorHex(selectedColor) }} />
                )}
              </div>
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
                    Producto
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categoría
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Color
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Precio
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.filter((p: any) => !selectedColor || p.color === selectedColor).map((product: any) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-3 sm:px-6 py-4 text-sm text-gray-900">
                      <div className="max-w-[200px] sm:max-w-none truncate">
                        {product.title || 'Sin título'}
                      </div>
                      {product.description && (
                        <div className="text-xs text-gray-500 mt-1 max-w-[200px] sm:max-w-none truncate">
                          {product.description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-4 text-sm text-gray-900">
                      <div className="max-w-[120px] sm:max-w-none truncate">
                        {product.category || 'Sin categoría'}
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 text-sm text-gray-900">
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-4 h-4 rounded border border-gray-300"
                          style={{ 
                            backgroundColor: product.color?.startsWith('#') ? product.color : '#CCCCCC',
                            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)'
                          }}
                        />
                        <span className="max-w-[80px] sm:max-w-none truncate">
                          {product.color || 'Sin color'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 text-sm text-gray-900">
                      {product.price ? (
                        <span className="font-medium">
                          ${product.price.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-400">Sin precio</span>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-4 text-sm text-gray-900">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        product.active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {product.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {products.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {currentFilters.search || currentFilters.category 
                ? 'No se encontraron productos con los filtros aplicados.'
                : 'No hay productos disponibles.'
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 
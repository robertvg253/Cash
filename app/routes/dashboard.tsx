import { LoaderFunctionArgs, ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { requireUser, logout } from "../utils/session.server";
import { supabase } from "../supabase.server";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

// Loader para obtener datos del usuario autenticado y métricas
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);

  // Obtener productos y cantidades de inventario
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, title, color, image_url");
  const { data: inventario, error: inventarioError } = await supabase
    .from("inventario")
    .select("product_id, cantidad");

  // Procesar métricas
  const totalProductos = products?.length || 0;
  const coloresSet = new Set(products?.map(p => p.color).filter(Boolean));
  const totalColores = coloresSet.size;
  const productosConImagen = products?.filter(p => p.image_url).length || 0;
  const productosSinImagen = totalProductos - productosConImagen;

  // Mapear cantidades
  const inventarioMap = new Map();
  inventario?.forEach(item => {
    inventarioMap.set(item.product_id, item.cantidad);
  });
  // Suma total de unidades
  let totalUnidades = 0;
  const productosConCantidad = products?.map(p => ({
    ...p,
    cantidad: inventarioMap.get(p.id) || 0
  })) || [];
  productosConCantidad.forEach(p => {
    totalUnidades += p.cantidad;
  });
  // Top 3 más y menos unidades
  const topMas = [...productosConCantidad].sort((a, b) => b.cantidad - a.cantidad).slice(0, 3);
  const topMenos = [...productosConCantidad].sort((a, b) => a.cantidad - b.cantidad).slice(0, 3);

  return json({
    user,
    metrics: {
      totalProductos,
      totalColores,
      productosConImagen,
      productosSinImagen,
      totalUnidades,
      topMas,
      topMenos
    }
  });
}

// Action para cerrar sesión
export async function action({ request }: ActionFunctionArgs) {
  return logout(request);
}

export default function Dashboard() {
  const { user, metrics } = useLoaderData<typeof loader>();

  // Datos para el gráfico: top 10 productos por cantidad
  const chartData = [...metrics.topMas, ...metrics.topMenos]
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10)
    .map((p: any) => ({ name: p.title?.slice(0, 14) + (p.title?.length > 14 ? '…' : ''), cantidad: p.cantidad }));

  return (
    <div className="min-h-screen bg-gray-50 w-full flex flex-col items-stretch overflow-x-hidden">
      <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 py-4 pt-16">
        {/* Módulo de usuario y cerrar sesión */}
        <div className="w-full bg-white border border-gray-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4 shadow-sm">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-gray-900">Bienvenido al CRM</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm sm:text-base text-gray-700">
              <span><span className="font-semibold">Nombre:</span> {user.name}</span>
              <span><span className="font-semibold">Correo:</span> {user.email}</span>
              <span><span className="font-semibold">Última visita:</span> {new Date(user.last_sign_in_at).toLocaleString()}</span>
            </div>
          </div>
          <form method="post">
            <button
              type="submit"
              className="px-5 py-2 bg-[#D727FF] text-white font-semibold rounded hover:bg-[#b81fc7] transition text-base shadow-sm"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
        {/* Métricas principales */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white border border-[#E9D7FE] rounded-lg p-4 flex flex-col items-center shadow-sm">
            <span className="text-2xl font-bold text-[#D727FF]">{metrics.totalProductos}</span>
            <span className="text-sm text-gray-700 mt-1 text-center">Productos en Catálogo</span>
          </div>
          <div className="bg-white border border-[#E9D7FE] rounded-lg p-4 flex flex-col items-center shadow-sm">
            <span className="text-2xl font-bold text-[#D727FF]">{metrics.totalUnidades}</span>
            <span className="text-sm text-gray-700 mt-1 text-center">Unidades en Inventario</span>
          </div>
          <div className="bg-white border border-[#E9D7FE] rounded-lg p-4 flex flex-col items-center shadow-sm">
            <span className="text-2xl font-bold text-[#D727FF]">{metrics.totalColores}</span>
            <span className="text-sm text-gray-700 mt-1 text-center">Colores Distintos</span>
          </div>
          <div className="bg-white border border-[#B6E0FE] rounded-lg p-4 flex flex-col items-center shadow-sm">
            <span className="text-2xl font-bold text-[#2563EB]">{metrics.productosConImagen}</span>
            <span className="text-sm text-gray-700 mt-1 text-center">Con Imagen</span>
          </div>
          <div className="bg-white border border-[#FECACA] rounded-lg p-4 flex flex-col items-center shadow-sm">
            <span className="text-2xl font-bold text-[#DC2626]">{metrics.productosSinImagen}</span>
            <span className="text-sm text-gray-700 mt-1 text-center">Sin Imagen</span>
          </div>
        </div>
        {/* Segunda fila: Gráfico y Top productos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Gráfico de barras */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm col-span-2 flex flex-col min-h-[260px]">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Inventario por producto</h2>
            <div className="w-full h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={40} tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="cantidad" fill="#D727FF" name="Unidades" radius={[4, 4, 0, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {/* Top productos */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Top 3 con más unidades</h2>
              <ul className="divide-y divide-gray-100">
                {metrics.topMas.map((p: any) => (
                  <li key={p.id} className="py-2 flex items-center justify-between">
                    <span className="truncate max-w-[120px] text-gray-800 text-sm font-medium">{p.title}</span>
                    <span className="font-mono text-[#D727FF] text-lg font-bold">{p.cantidad}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Top 3 con menos unidades</h2>
              <ul className="divide-y divide-gray-100">
                {metrics.topMenos.map((p: any) => (
                  <li key={p.id} className="py-2 flex items-center justify-between">
                    <span className="truncate max-w-[120px] text-gray-800 text-sm font-medium">{p.title}</span>
                    <span className="font-mono text-[#D727FF] text-lg font-bold">{p.cantidad}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
import { LoaderFunctionArgs, ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { requireUser, logout } from "../utils/session.server";

// Loader para obtener datos del usuario autenticado
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  return json({ user });
}

// Action para cerrar sesión
export async function action({ request }: ActionFunctionArgs) {
  return logout(request);
}

export default function Dashboard() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-full max-w-md p-8 rounded shadow border border-gray-200">
        <h1 className="text-xl font-semibold mb-4 text-gray-900">Bienvenido al CRM</h1>
        <div className="mb-6 space-y-2">
          <div className="text-sm text-gray-700"><span className="font-medium">Nombre:</span> {user.name}</div>
          <div className="text-sm text-gray-700"><span className="font-medium">Correo:</span> {user.email}</div>
          <div className="text-sm text-gray-700"><span className="font-medium">Última visita:</span> {new Date(user.last_sign_in_at).toLocaleString()}</div>
        </div>
        <Form method="post">
          <button
            type="submit"
            className="w-full py-2 px-4 bg-[#D727FF] text-white font-medium rounded hover:bg-[#b81fc7] transition"
          >
            Cerrar sesión
          </button>
        </Form>
      </div>
    </div>
  );
} 
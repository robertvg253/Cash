import { ActionFunctionArgs, LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { Form, useActionData, useSearchParams } from "@remix-run/react";
import { supabase } from "../supabase.server";
import { createUserSession } from "../utils/session.server";

// Loader: no hace nada especial por ahora
export async function loader(_args: LoaderFunctionArgs) {
  return null;
}

// Action: autenticación con Supabase y guardado de sesión
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");
  const redirectTo = formData.get("redirectTo") || "/dashboard";

  if (!email || !password) {
    return json({ error: "Por favor, completa todos los campos." }, { status: 400 });
  }

  // Autenticación real con Supabase
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email),
    password: String(password),
  });

  if (error) {
    return json({ error: error.message }, { status: 401 });
  }

  // Si el login es exitoso, guardar sesión y redirigir
  const userData = {
    id: data.user?.id,
    email: data.user?.email,
    name: data.user?.user_metadata?.name || data.user?.email?.split('@')[0],
    last_sign_in_at: data.user?.last_sign_in_at,
  };

  return createUserSession(data.user?.id!, userData, String(redirectTo));
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md border border-gray-200 p-8 rounded shadow">
        <h1 className="text-xl font-semibold mb-6 text-gray-900 text-center">Iniciar Sesión</h1>
        <Form method="post" className="space-y-5">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-gray-600 mb-1">Correo electrónico</label>
            <input
              type="email"
              name="email"
              id="email"
              className="mt-0 block w-full rounded border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
            <input
              type="password"
              name="password"
              id="password"
              className="mt-0 block w-full rounded border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:border-[#D727FF] focus:ring-[#D727FF] outline-none"
              required
              autoComplete="current-password"
            />
          </div>
          {actionData?.error && (
            <div className="text-[#D727FF] text-xs text-center font-medium">{actionData.error}</div>
          )}
          <button
            type="submit"
            className="w-full py-2 px-4 bg-[#D727FF] text-white font-semibold rounded hover:bg-[#b81fc7] transition text-sm"
          >
            Iniciar Sesión
          </button>
        </Form>
      </div>
    </div>
  );
} 
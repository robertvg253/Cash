import { createCookieSessionStorage, redirect } from "@remix-run/node";
import { supabase } from "../supabase.server";

// Configuración de la cookie de sesión
const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "crm_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET || "default-secret"],
    secure: process.env.NODE_ENV === "production",
  },
});

// Obtener sesión desde la cookie
export async function getSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}

// Guardar sesión del usuario
export async function createUserSession(userId: string, userData: any, redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set("userId", userId);
  session.set("userData", userData);
  
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

// Obtener datos del usuario desde la sesión
export async function getUser(request: Request) {
  const session = await getSession(request);
  const userId = session.get("userId");
  const userData = session.get("userData");
  
  if (!userId || !userData) {
    return null;
  }
  
  return userData;
}

// Verificar si el usuario está autenticado
export async function requireUser(request: Request) {
  const user = await getUser(request);
  
  if (!user) {
    throw redirect("/login");
  }
  
  return user;
}

// Cerrar sesión
export async function logout(request: Request) {
  const session = await getSession(request);
  
  return redirect("/login", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
} 
import { LoaderFunctionArgs } from "@remix-run/node";
import { requireUser } from "../utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  return null;
}

export default function Productos() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <h1 className="text-2xl font-semibold text-gray-900">Productos</h1>
    </div>
  );
} 
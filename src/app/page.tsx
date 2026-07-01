import { Ambiental } from "@/components/sentra/Ambiental";
import { Biodiversidad } from "@/components/sentra/Biodiversidad";
import { Ciencia } from "@/components/sentra/Ciencia";
import { ComoFunciona } from "@/components/sentra/ComoFunciona";
import { Contacto } from "@/components/sentra/Contacto";
import { Desafio } from "@/components/sentra/Desafio";
import { Footer } from "@/components/sentra/Footer";
import { Hero } from "@/components/sentra/Hero";
import { Impacto } from "@/components/sentra/Impacto";
import { LiveDashboard } from "@/components/sentra/LiveDashboard";
import { Nav } from "@/components/sentra/Nav";
import { Nosotros } from "@/components/sentra/Nosotros";
import { Plataforma } from "@/components/sentra/Plataforma";
import { Proyectos } from "@/components/sentra/Proyectos";

export default function Home() {
  return (
    <div className="w-full bg-bg text-text">
      <Nav />
      <Hero />
      <Desafio />
      <Plataforma />
      <ComoFunciona />
      <LiveDashboard />
      <Ambiental />
      <Biodiversidad />
      <Impacto />
      <Ciencia />
      <Nosotros />
      <Proyectos />
      <Contacto />
      <Footer />
    </div>
  );
}

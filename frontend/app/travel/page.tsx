import type { Metadata } from "next";
import "../landing.css";
import "./travel.css";
import LandingFooter from "../../components/landing/LandingFooter";
import LandingNav from "../../components/landing/LandingNav";
import TravelGuardian from "./travel-guardian";

export const metadata: Metadata = {
  title: "Travel Price Guardian | Jacobi",
  description:
    "Compare equivalent flight and hotel offers, preserve mandatory-cost uncertainty, and revalidate the route before leaving Jacobi.",
};

export default function TravelPage() {
  return (
    <div className="jx">
      <LandingNav />
      <main className="tg-page">
        <TravelGuardian />
      </main>
      <LandingFooter />
    </div>
  );
}

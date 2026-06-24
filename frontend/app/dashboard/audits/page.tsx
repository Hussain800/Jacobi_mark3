import CockpitProbe from "../../../components/design/cockpit/CockpitProbe";
import { PageHead } from "../ui";

export default function AuditsPage() {
  return (
    <div>
      <PageHead
        eyebrow="Run audit · live"
        title="Run a pricing audit"
        lede="Paste any public product, checkout, or pricing URL. Jacobi runs 24 controlled synthetic buyers across geography, device, cookies, and referral, then returns the variation and evidence. This is a real, live audit — not demo data."
      />
      <CockpitProbe />
    </div>
  );
}

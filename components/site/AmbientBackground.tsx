export default function AmbientBackground() {
  return (
    <div className="bg-orbs" aria-hidden="true">
      <div className="orb orb-violet" />
      <div className="orb orb-cyan" />
      <div className="orb orb-pink" />
      <div className="grid-overlay" />
      <div className="noise-overlay" />
    </div>
  );
}

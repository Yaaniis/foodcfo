// Repère de marque partagé par les écrans sans coquille (connexion,
// mot de passe oublié/réinitialisation, inscription) — même logo que
// AppShell.tsx, à l'échelle validée au point 8.1.6 de l'artefact.
export default function AuthBrandMark() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-[46px] h-[46px] rounded-card-sm bg-logo-fill shadow-logo flex items-center justify-center shrink-0">
        <span className="font-logo italic font-bold text-[27px] leading-none text-accent-text -translate-x-px translate-y-px">
          F
        </span>
      </div>
      <span className="font-logo font-bold text-[23px]">FoodCFO</span>
    </div>
  );
}

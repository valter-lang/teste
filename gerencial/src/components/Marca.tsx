/* eslint-disable @next/next/no-img-element */
/**
 * Exibe o logotipo oficial quando um arquivo aprovado foi enviado em Configurações.
 * Sem arquivo, mostra apenas o nome da empresa em texto (não é um logotipo).
 */
export function Marca({ logoId, claro = true }: { logoId: string | null; claro?: boolean }) {
  if (logoId) return <img src={`/api/arquivos/${logoId}`} alt="Costa Lavos" className="h-10 w-auto object-contain" />
  return (
    <span className={`font-titulo text-lg font-extrabold tracking-wide ${claro ? 'text-branco' : 'text-vinho'}`}>
      Costa Lavos
    </span>
  )
}

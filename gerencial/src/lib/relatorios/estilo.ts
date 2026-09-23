/**
 * Identidade visual dos relatórios exportados (Excel, PDF e PowerPoint).
 * Cores sem '#' (formato aceito por pptxgenjs/exceljs); use cor() para CSS.
 */
import type { Status } from '@/lib/indicadores/status'

export const COR = {
  vinho: '6A1025',
  vermelho: 'A41E22',
  tinta: '361319',
  escuro: '241015',
  creme: 'F3EFEB',
  dourado: 'D6B46C',
  douradoEscuro: '8A6A1F',
  pedra: 'C9C5C1',
  pedraClara: 'E4E0DC',
  branco: 'FFFFFF',
  marrom: '8B5E3C',
  neutro: '5F5A57',
  neutroFundo: 'EFECE9',
  rosaClaro: 'E9D3D6',
} as const

export const cor = (c: string) => `#${c}`

export interface EstiloStatus { texto: string; simbolo: string; cor: string; fundo: string }

/** Semáforo: sempre texto + símbolo, nunca apenas cor. */
export const STATUS_REL: Record<Status, EstiloStatus> = {
  VERDE: { texto: 'Na meta', simbolo: '✓', cor: '1F7A4A', fundo: 'E6F4EC' },
  AMARELO: { texto: 'Atenção', simbolo: '!', cor: '8A5A00', fundo: 'FBF1D9' },
  VERMELHO: { texto: 'Fora da meta', simbolo: '▲', cor: 'A41E22', fundo: 'F8E3E3' },
  SEM_META: { texto: 'Sem meta homologada', simbolo: '–', cor: '5F5A57', fundo: 'EFECE9' },
  NA: { texto: 'Sem avaliação', simbolo: '?', cor: '5F5A57', fundo: 'EFECE9' },
}

export const rotuloStatus = (s: Status) => `${STATUS_REL[s].simbolo} ${STATUS_REL[s].texto}`

export const REGRA_SEMAFORO =
  'Verde: atingiu a meta; Amarelo: fora da meta até 5% de tolerância; Vermelho: além da tolerância — exige plano de ação'

export type FonteExportacao = 'OFICIAL' | 'SEGURA'

export interface Fontes { corpo: string; titulo: string; capa: string; pilhaCorpo: string; pilhaTitulo: string; pilhaCapa: string }

export function fontes(modo: FonteExportacao): Fontes {
  if (modo === 'SEGURA') {
    return {
      corpo: 'Calibri', titulo: 'Arial', capa: 'Arial',
      pilhaCorpo: `Calibri, Arial, 'Liberation Sans', sans-serif`,
      pilhaTitulo: `Arial, 'Liberation Sans', sans-serif`,
      pilhaCapa: `Arial, 'Liberation Sans', sans-serif`,
    }
  }
  return {
    corpo: 'Plus Jakarta Sans', titulo: 'Nunito', capa: 'Playfair Display',
    pilhaCorpo: `'Plus Jakarta Sans', 'Segoe UI', Arial, 'Liberation Sans', sans-serif`,
    pilhaTitulo: `'Nunito', 'Plus Jakarta Sans', 'Segoe UI', Arial, 'Liberation Sans', sans-serif`,
    pilhaCapa: `'Playfair Display', Georgia, 'Liberation Serif', serif`,
  }
}

export const URL_FONTES_GOOGLE =
  'https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600&display=swap'

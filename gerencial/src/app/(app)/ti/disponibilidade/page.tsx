import { PaginaLista } from '@/components/form/PaginaLista'
import { BotaoAcao } from '@/components/form/BotaoAcao'
import { Card } from '@/components/ui'
import { acaoJanelasExpediente } from '@/lib/operacao/acoes'
import { sugestaoJanela } from '@/lib/operacao/ti'
import { competenciaLonga, numero } from '@/lib/format'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Disponibilidade de sistemas' }

async function AjudaExpediente({ competencia, bloqueio }: { competencia: string; bloqueio: string | null }) {
  const minutos = await sugestaoJanela(competencia)
  return (
    <Card titulo="Calcular pelo expediente">
      <p className="mb-3 text-sm">
        Pelo calendário oficial, {competenciaLonga(competencia)} tem <strong>{numero(minutos, 0)} minutos</strong> de expediente
        ({numero(minutos / 60, 1)} horas úteis, descontados fins de semana e feriados). Use este valor para sistemas que operam no horário comercial;
        sistemas 24×7 devem ter a janela informada manualmente.
      </p>
      <BotaoAcao acao={acaoJanelasExpediente.bind(null, competencia)} rotulo="Criar janelas pelo expediente para os sistemas sem janela" desabilitado={!!bloqueio} />
    </Card>
  )
}

export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PaginaLista rota="/ti/disponibilidade" titulo="Disponibilidade de sistemas" searchParams={searchParams}
      extras={(def, comp, bloqueio) => (def.chave === 'ti_janela_programada' ? <AjudaExpediente competencia={comp} bloqueio={bloqueio} /> : null)} />
  )
}

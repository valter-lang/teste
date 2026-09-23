'use client'
import { AreaTexto, Entrada, Selecao } from '@/components/ui'
import type { CampoCliente } from '@/lib/operacao/tipos'

/**
 * Controle de entrada conforme o tipo do campo. Controlado quando `onChange` é informado
 * (grade); caso contrário usa defaultValue (formulário com server action).
 */
export function CampoEntrada({
  campo, valor, onChange, id, invalido, desabilitado, rotuloAcessivel, descritoPor, compacto,
}: {
  campo: CampoCliente
  valor: string
  onChange?: (v: string) => void
  id: string
  invalido?: boolean
  desabilitado?: boolean
  rotuloAcessivel?: string
  descritoPor?: string
  compacto?: boolean
}) {
  const comum = {
    id,
    name: onChange ? undefined : campo.nome,
    disabled: desabilitado || campo.somenteLeitura,
    invalido,
    'aria-label': rotuloAcessivel,
    'aria-describedby': descritoPor,
    'aria-required': campo.obrigatorio || undefined,
    className: compacto ? 'min-w-28 px-2 py-1' : undefined,
  }
  const valorProps = onChange
    ? { value: valor, onChange: (e: { target: { value: string } }) => onChange(e.target.value) }
    : { defaultValue: valor }

  switch (campo.tipo) {
    case 'textoLongo':
      return compacto
        ? <Entrada {...comum} {...valorProps} type="text" />
        : <AreaTexto {...comum} {...valorProps} rows={3} />
    case 'bool':
      return (
        <Selecao {...comum} {...valorProps}>
          {!campo.obrigatorio && <option value="">Selecione</option>}
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </Selecao>
      )
    case 'boolNulo':
      return (
        <Selecao {...comum} {...valorProps}>
          <option value="">Não informado</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </Selecao>
      )
    case 'enum':
    case 'ref':
      return (
        <Selecao {...comum} {...valorProps}>
          <option value="">{campo.obrigatorio ? 'Selecione' : 'Não informado'}</option>
          {(campo.opcoes ?? []).map((o) => (
            <option key={o.valor} value={o.valor}>{o.rotulo}</option>
          ))}
        </Selecao>
      )
    case 'data':
      return <Entrada {...comum} {...valorProps} type="date" />
    case 'dataHora':
      return <Entrada {...comum} {...valorProps} type="datetime-local" />
    case 'competencia':
      return <Entrada {...comum} {...valorProps} type="month" placeholder="aaaa-mm" />
    case 'inteiro':
      return <Entrada {...comum} {...valorProps} type="text" inputMode="numeric" autoComplete="off" />
    case 'decimal':
    case 'moeda':
      return <Entrada {...comum} {...valorProps} type="text" inputMode="decimal" autoComplete="off" placeholder={campo.tipo === 'moeda' ? '0,00' : undefined} />
    case 'email':
      return <Entrada {...comum} {...valorProps} type="email" autoComplete="off" />
    default:
      return <Entrada {...comum} {...valorProps} type="text" autoComplete="off" />
  }
}

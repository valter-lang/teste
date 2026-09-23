import { describe, expect, it } from 'vitest'
import { validarPoliticaSenha } from '@/lib/auth/senha'
import { esquemaAtribuicao, esquemaUsuario, gerarSenhaTemporaria } from '@/lib/usuarios/servico'

describe('senha temporária', () => {
  it('atende à política e é aleatória', () => {
    const vistas = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const s = gerarSenhaTemporaria()
      expect(s).toHaveLength(14)
      expect(validarPoliticaSenha(s)).toBeNull()
      expect(s).not.toMatch(/[0O1lI]/)
      vistas.add(s)
    }
    expect(vistas.size).toBe(200)
  })
})

describe('validação de usuário e atribuição', () => {
  it('normaliza e-mail e exige nome', () => {
    expect(esquemaUsuario.parse({ nome: ' Maria Silva ', email: ' Maria@Costa.COM ' })).toEqual({ nome: 'Maria Silva', email: 'maria@costa.com' })
    expect(esquemaUsuario.safeParse({ nome: 'Ma', email: 'x@y.com' }).success).toBe(false)
    expect(esquemaUsuario.safeParse({ nome: 'Maria', email: 'invalido' }).success).toBe(false)
  })
  it('atribuição: "todas" vira nulo e valores inválidos são recusados', () => {
    expect(esquemaAtribuicao.parse({ papel: 'GESTOR', area: '*', unidadeId: '' })).toEqual({ papel: 'GESTOR', area: null, unidadeId: null })
    expect(esquemaAtribuicao.parse({ papel: 'LANCADOR', area: 'TI', unidadeId: '1' })).toEqual({ papel: 'LANCADOR', area: 'TI', unidadeId: 1 })
    expect(esquemaAtribuicao.safeParse({ papel: 'ROOT', area: '', unidadeId: '' }).success).toBe(false)
    expect(esquemaAtribuicao.safeParse({ papel: 'ADMIN', area: 'RH', unidadeId: '' }).success).toBe(false)
    expect(esquemaAtribuicao.safeParse({ papel: 'ADMIN', area: '', unidadeId: 'x' }).success).toBe(false)
  })
})

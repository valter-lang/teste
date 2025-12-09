// ========================================
// SUPABASE CLIENT - CONFIGURAÇÃO CORRETA
// ========================================

// Configuração do Supabase
const SUPABASE_URL = 'https://gnllgjrgddyuqzddkhfo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdubGxnanJnZGR5dXF6ZGRraGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMjYxMjMsImV4cCI6MjA3MTgwMjEyM30.b9vsWxYc62r4bd960tW0pgfGyMaz1H024XFfPvdzoDc';

// ========================================
// FUNÇÕES DE CONSULTA USANDO FETCH API
// ========================================

/**
 * Headers padrão para requisições Supabase
 * IMPORTANTE: Accept-Profile: 'public' é necessário!
 */
function getSupabaseHeaders() {
    return {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Accept-Profile': 'public', // CRÍTICO: sem isso não retorna dados!
        'Content-Type': 'application/json'
    };
}

/**
 * Buscar todos os equipamentos com paginação
 */
async function buscarTodosEquipamentos(limit = 10000) {
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/bd_cl_inv?select=*&limit=${limit}`,
            { headers: getSupabaseHeaders() }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`✅ Buscados ${data.length} equipamentos do Supabase`);
        return data || [];
    } catch (error) {
        console.error('❌ Erro ao buscar equipamentos:', error);
        return [];
    }
}

/**
 * Buscar estatísticas para o dashboard
 */
async function buscarEstatisticasSupabase() {
    try {
        console.log('📊 Buscando dados do Supabase...');

        // Buscar todos os equipamentos
        const equipamentos = await buscarTodosEquipamentos();

        if (equipamentos.length === 0) {
            console.warn('⚠️ Nenhum equipamento encontrado');
            return {
                totalEquipamentos: 0,
                totalLojas: 0,
                totalClientes: 0,
                porStatus: {},
                porRegiao: {},
                porVendedor: {},
                porSupervisor: {},
                porEquipamento: {},
                equipamentos: []
            };
        }

        // Calcular estatísticas
        const stats = {
            totalEquipamentos: equipamentos.reduce((sum, eq) => sum + (eq.QTD || 0), 0),
            totalLojas: new Set(equipamentos.map(eq => `${eq.Codigo}-${eq.Loja}`)).size,
            totalClientes: new Set(equipamentos.map(eq => eq.Codigo)).size,
            porStatus: {},
            porRegiao: {},
            porVendedor: {},
            porSupervisor: {},
            porEquipamento: {},
            equipamentos: equipamentos
        };

        // Agrupar por status
        equipamentos.forEach(eq => {
            const status = eq.AA3_STATUS || 'Sem Status';
            stats.porStatus[status] = (stats.porStatus[status] || 0) + (eq.QTD || 0);
        });

        // Agrupar por região
        equipamentos.forEach(eq => {
            const regiao = eq.REGIAO || 'Sem Região';
            stats.porRegiao[regiao] = (stats.porRegiao[regiao] || 0) + (eq.QTD || 0);
        });

        // Agrupar por vendedor
        equipamentos.forEach(eq => {
            const vendedor = eq.Nome_Vendedor || 'Sem Vendedor';
            stats.porVendedor[vendedor] = (stats.porVendedor[vendedor] || 0) + (eq.QTD || 0);
        });

        // Agrupar por supervisor
        equipamentos.forEach(eq => {
            const supervisor = eq.Nome_Supervisor || 'Sem Supervisor';
            stats.porSupervisor[supervisor] = (stats.porSupervisor[supervisor] || 0) + (eq.QTD || 0);
        });

        // Agrupar por equipamento
        equipamentos.forEach(eq => {
            const equip = eq.Equipamento || 'Sem Nome';
            stats.porEquipamento[equip] = (stats.porEquipamento[equip] || 0) + (eq.QTD || 0);
        });

        console.log(`✅ Estatísticas calculadas: ${stats.totalEquipamentos} equipamentos, ${stats.totalLojas} lojas, ${stats.totalClientes} clientes`);
        return stats;
    } catch (error) {
        console.error('❌ Erro ao buscar estatísticas:', error);
        return {
            totalEquipamentos: 0,
            totalLojas: 0,
            totalClientes: 0,
            porStatus: {},
            porRegiao: {},
            porVendedor: {},
            porSupervisor: {},
            porEquipamento: {},
            equipamentos: []
        };
    }
}

/**
 * Buscar equipamentos com filtros
 */
async function buscarEquipamentosComFiltros(filtros = {}) {
    try {
        let url = `${SUPABASE_URL}/rest/v1/bd_cl_inv?select=*`;

        // Aplicar filtros
        if (filtros.regiao) {
            url += `&REGIAO=eq.${encodeURIComponent(filtros.regiao)}`;
        }
        if (filtros.vendedor) {
            url += `&VENDEDOR=eq.${filtros.vendedor}`;
        }
        if (filtros.supervisor) {
            url += `&SUPERVISOR=eq.${filtros.supervisor}`;
        }
        if (filtros.status) {
            url += `&AA3_STATUS=eq.${encodeURIComponent(filtros.status)}`;
        }
        if (filtros.busca) {
            url += `&or=(Codigo.ilike.%${encodeURIComponent(filtros.busca)}%,Loja.ilike.%${encodeURIComponent(filtros.busca)}%,Equipamento.ilike.%${encodeURIComponent(filtros.busca)}%,Fantasia.ilike.%${encodeURIComponent(filtros.busca)}%)`;
        }

        url += '&order=Data_Venda.desc&limit=1000';

        const response = await fetch(url, { headers: getSupabaseHeaders() });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data || [];
    } catch (error) {
        console.error('❌ Erro ao buscar equipamentos com filtros:', error);
        return [];
    }
}

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

/**
 * Formatar data para exibição
 */
function formatarData(dataISO) {
    if (!dataISO) return '-';
    const data = new Date(dataISO);
    return data.toLocaleDateString('pt-BR');
}

/**
 * Obter badge de status
 */
function obterBadgeStatus(status) {
    const statusMap = {
        '01': '<span class="badge badge-success">✅ Ativo</span>',
        'X1': '<span class="badge badge-warning">⚠️ Pendente</span>',
        '02': '<span class="badge badge-info">📦 Em Uso</span>',
        '03': '<span class="badge badge-danger">🔧 Manutenção</span>'
    };

    return statusMap[status] || `<span class="badge badge-info">${status || 'Sem Status'}</span>`;
}

/**
 * Verificar conexão com Supabase
 */
async function verificarConexaoSupabase() {
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/bd_cl_inv?select=Chave_ID&limit=1`,
            { headers: getSupabaseHeaders() }
        );

        if (!response.ok) {
            console.error(`❌ Erro de conexão: HTTP ${response.status}`);
            return false;
        }

        const data = await response.json();
        console.log('✅ Conexão com Supabase estabelecida com sucesso!');
        console.log(`📊 Teste de query executado: ${data.length} registro(s) retornado(s)`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao conectar com Supabase:', error);
        return false;
    }
}

console.log('✅ Supabase client configurado com fetch API e Accept-Profile header!');

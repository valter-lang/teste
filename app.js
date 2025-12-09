// ========================================
// CONTROLE DE ESTOQUE DE EQUIPAMENTOS
// Sistema de Gerenciamento Completo
// ========================================

// ========================================
// GERENCIAMENTO DE DADOS (LocalStorage)
// ========================================

// Obter dados do localStorage
function obterDados(chave) {
    const dados = localStorage.getItem(chave);
    return dados ? JSON.parse(dados) : [];
}

// Salvar dados no localStorage
function salvarDados(chave, dados) {
    localStorage.setItem(chave, JSON.stringify(dados));
}

// Gerar ID único
function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ========================================
// FORNECEDORES
// ========================================

// Salvar fornecedor
function salvarFornecedor(e) {
    e.preventDefault();
    
    const fornecedor = {
        id: gerarId(),
        nome: document.getElementById('nome-fornecedor').value,
        cnpj: document.getElementById('cnpj').value,
        contato: document.getElementById('contato').value,
        email: document.getElementById('email').value,
        telefone: document.getElementById('telefone').value,
        endereco: document.getElementById('endereco').value,
        observacoes: document.getElementById('observacoes').value,
        dataCadastro: new Date().toISOString()
    };
    
    const fornecedores = obterDados('fornecedores');
    fornecedores.push(fornecedor);
    salvarDados('fornecedores', fornecedores);
    
    alert('✅ Fornecedor cadastrado com sucesso!');
    limparFormularioFornecedor();
    carregarFornecedores();
    carregarFornecedoresSelect();
}

// Carregar fornecedores na tabela
function carregarFornecedores() {
    const fornecedores = obterDados('fornecedores');
    const equipamentos = obterDados('equipamentos');
    const tbody = document.getElementById('tabela-fornecedores');
    const total = document.getElementById('total-fornecedores');
    
    if (total) {
        total.textContent = `${fornecedores.length} fornecedor${fornecedores.length !== 1 ? 'es' : ''}`;
    }
    
    if (!tbody) return;
    
    if (fornecedores.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center" style="padding: 2rem; color: var(--gray);">
                    Nenhum fornecedor cadastrado
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = fornecedores.map(f => {
        const qtdEquipamentos = equipamentos.filter(e => e.fornecedorId === f.id).length;
        return `
            <tr>
                <td><strong>${f.nome}</strong></td>
                <td>${f.cnpj}</td>
                <td>${f.contato || '-'}</td>
                <td>${f.email || '-'}</td>
                <td>${f.telefone || '-'}</td>
                <td><span class="badge badge-info">${qtdEquipamentos} equipamento${qtdEquipamentos !== 1 ? 's' : ''}</span></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="editarFornecedor('${f.id}')">
                        ✏️ Editar
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="excluirFornecedor('${f.id}')">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Carregar fornecedores nos selects
function carregarFornecedoresSelect() {
    const fornecedores = obterDados('fornecedores');
    const selects = ['fornecedor', 'edit-fornecedor', 'filtro-fornecedor'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        const valorAtual = select.value;
        const primeiraOpcao = select.querySelector('option');
        
        select.innerHTML = '';
        if (primeiraOpcao) {
            select.appendChild(primeiraOpcao);
        }
        
        fornecedores.forEach(f => {
            const option = document.createElement('option');
            option.value = f.id;
            option.textContent = f.nome;
            select.appendChild(option);
        });
        
        if (valorAtual) {
            select.value = valorAtual;
        }
    });
}

// Editar fornecedor
function editarFornecedor(id) {
    const fornecedores = obterDados('fornecedores');
    const fornecedor = fornecedores.find(f => f.id === id);
    
    if (!fornecedor) return;
    
    document.getElementById('edit-fornecedor-id').value = fornecedor.id;
    document.getElementById('edit-nome-fornecedor').value = fornecedor.nome;
    document.getElementById('edit-cnpj').value = fornecedor.cnpj;
    document.getElementById('edit-contato').value = fornecedor.contato || '';
    document.getElementById('edit-email').value = fornecedor.email || '';
    document.getElementById('edit-telefone').value = fornecedor.telefone || '';
    document.getElementById('edit-endereco').value = fornecedor.endereco || '';
    document.getElementById('edit-observacoes').value = fornecedor.observacoes || '';
    
    document.getElementById('modal-editar-fornecedor').classList.add('active');
}

// Atualizar fornecedor
function atualizarFornecedor(e) {
    e.preventDefault();
    
    const id = document.getElementById('edit-fornecedor-id').value;
    const fornecedores = obterDados('fornecedores');
    const index = fornecedores.findIndex(f => f.id === id);
    
    if (index === -1) return;
    
    fornecedores[index] = {
        ...fornecedores[index],
        nome: document.getElementById('edit-nome-fornecedor').value,
        cnpj: document.getElementById('edit-cnpj').value,
        contato: document.getElementById('edit-contato').value,
        email: document.getElementById('edit-email').value,
        telefone: document.getElementById('edit-telefone').value,
        endereco: document.getElementById('edit-endereco').value,
        observacoes: document.getElementById('edit-observacoes').value
    };
    
    salvarDados('fornecedores', fornecedores);
    alert('✅ Fornecedor atualizado com sucesso!');
    fecharModalFornecedor();
    carregarFornecedores();
    carregarFornecedoresSelect();
}

// Excluir fornecedor
function excluirFornecedor(id) {
    if (!confirm('Tem certeza que deseja excluir este fornecedor?')) return;
    
    const fornecedores = obterDados('fornecedores');
    const novosFornecedores = fornecedores.filter(f => f.id !== id);
    salvarDados('fornecedores', novosFornecedores);
    
    alert('✅ Fornecedor excluído com sucesso!');
    carregarFornecedores();
}

// Filtrar fornecedores
function filtrarFornecedores() {
    const busca = document.getElementById('busca-fornecedor').value.toLowerCase();
    const fornecedores = obterDados('fornecedores');
    
    const filtrados = fornecedores.filter(f => 
        f.nome.toLowerCase().includes(busca) ||
        f.cnpj.includes(busca)
    );
    
    const tbody = document.getElementById('tabela-fornecedores');
    const equipamentos = obterDados('equipamentos');
    
    if (filtrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center" style="padding: 2rem; color: var(--gray);">
                    Nenhum fornecedor encontrado
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filtrados.map(f => {
        const qtdEquipamentos = equipamentos.filter(e => e.fornecedorId === f.id).length;
        return `
            <tr>
                <td><strong>${f.nome}</strong></td>
                <td>${f.cnpj}</td>
                <td>${f.contato || '-'}</td>
                <td>${f.email || '-'}</td>
                <td>${f.telefone || '-'}</td>
                <td><span class="badge badge-info">${qtdEquipamentos} equipamento${qtdEquipamentos !== 1 ? 's' : ''}</span></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="editarFornecedor('${f.id}')">
                        ✏️ Editar
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="excluirFornecedor('${f.id}')">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function limparFormularioFornecedor() {
    document.getElementById('form-fornecedor').reset();
}

function fecharModalFornecedor() {
    document.getElementById('modal-editar-fornecedor').classList.remove('active');
}

// ========================================
// EQUIPAMENTOS
// ========================================

// Salvar equipamento
function salvarEquipamento(e) {
    e.preventDefault();
    
    const qtdNovos = parseInt(document.getElementById('qtd-novos').value) || 0;
    const qtdUsados = parseInt(document.getElementById('qtd-usados').value) || 0;
    
    const equipamento = {
        id: gerarId(),
        codigo: document.getElementById('codigo').value,
        nome: document.getElementById('nome').value,
        fornecedorId: document.getElementById('fornecedor').value,
        custo: parseFloat(document.getElementById('custo').value),
        qtdNovos: qtdNovos,
        qtdUsados: qtdUsados,
        qtdAtual: qtdNovos + qtdUsados,
        estoqueMinimo: parseInt(document.getElementById('estoque-minimo').value),
        comprasChegar: parseInt(document.getElementById('compras-chegar').value) || 0,
        dataCadastro: new Date().toISOString()
    };
    
    const equipamentos = obterDados('equipamentos');
    equipamentos.push(equipamento);
    salvarDados('equipamentos', equipamentos);
    
    alert('✅ Equipamento cadastrado com sucesso!');
    limparFormulario();
    carregarEquipamentos();
}

// Carregar equipamentos na tabela
function carregarEquipamentos() {
    const equipamentos = obterDados('equipamentos');
    const fornecedores = obterDados('fornecedores');
    const tbody = document.getElementById('tabela-equipamentos');
    const total = document.getElementById('total-equipamentos-lista');
    
    if (total) {
        total.textContent = `${equipamentos.length} equipamento${equipamentos.length !== 1 ? 's' : ''}`;
    }
    
    if (!tbody) return;
    
    if (equipamentos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center" style="padding: 2rem; color: var(--gray);">
                    Nenhum equipamento cadastrado
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = equipamentos.map(eq => {
        const fornecedor = fornecedores.find(f => f.id === eq.fornecedorId);
        const status = obterStatusEquipamento(eq);
        
        return `
            <tr>
                <td><strong>${eq.codigo}</strong></td>
                <td>${eq.nome}</td>
                <td>${eq.qtdNovos}</td>
                <td>${eq.qtdUsados}</td>
                <td><strong>${eq.qtdAtual}</strong></td>
                <td>${eq.estoqueMinimo}</td>
                <td>R$ ${eq.custo.toFixed(2)}</td>
                <td>${eq.comprasChegar || 0}</td>
                <td>${status.badge}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="editarEquipamento('${eq.id}')">
                        ✏️
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="excluirEquipamento('${eq.id}')">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Obter status do equipamento
function obterStatusEquipamento(equipamento) {
    const percentual = (equipamento.qtdAtual / equipamento.estoqueMinimo) * 100;
    
    if (equipamento.qtdAtual === 0) {
        return { status: 'critico', badge: '<span class="badge badge-danger">❌ Sem Estoque</span>' };
    } else if (equipamento.qtdAtual < equipamento.estoqueMinimo) {
        return { status: 'baixo', badge: '<span class="badge badge-warning">⚠️ Baixo</span>' };
    } else {
        return { status: 'ok', badge: '<span class="badge badge-success">✅ OK</span>' };
    }
}

// Editar equipamento
function editarEquipamento(id) {
    const equipamentos = obterDados('equipamentos');
    const equipamento = equipamentos.find(e => e.id === id);
    
    if (!equipamento) return;
    
    document.getElementById('edit-id').value = equipamento.id;
    document.getElementById('edit-codigo').value = equipamento.codigo;
    document.getElementById('edit-nome').value = equipamento.nome;
    document.getElementById('edit-fornecedor').value = equipamento.fornecedorId;
    document.getElementById('edit-custo').value = equipamento.custo;
    document.getElementById('edit-qtd-novos').value = equipamento.qtdNovos;
    document.getElementById('edit-qtd-usados').value = equipamento.qtdUsados;
    document.getElementById('edit-estoque-minimo').value = equipamento.estoqueMinimo;
    document.getElementById('edit-compras-chegar').value = equipamento.comprasChegar || 0;
    
    document.getElementById('modal-editar').classList.add('active');
}

// Atualizar equipamento
function atualizarEquipamento(e) {
    e.preventDefault();
    
    const id = document.getElementById('edit-id').value;
    const equipamentos = obterDados('equipamentos');
    const index = equipamentos.findIndex(e => e.id === id);
    
    if (index === -1) return;
    
    const qtdNovos = parseInt(document.getElementById('edit-qtd-novos').value) || 0;
    const qtdUsados = parseInt(document.getElementById('edit-qtd-usados').value) || 0;
    
    equipamentos[index] = {
        ...equipamentos[index],
        codigo: document.getElementById('edit-codigo').value,
        nome: document.getElementById('edit-nome').value,
        fornecedorId: document.getElementById('edit-fornecedor').value,
        custo: parseFloat(document.getElementById('edit-custo').value),
        qtdNovos: qtdNovos,
        qtdUsados: qtdUsados,
        qtdAtual: qtdNovos + qtdUsados,
        estoqueMinimo: parseInt(document.getElementById('edit-estoque-minimo').value),
        comprasChegar: parseInt(document.getElementById('edit-compras-chegar').value) || 0
    };
    
    salvarDados('equipamentos', equipamentos);
    alert('✅ Equipamento atualizado com sucesso!');
    fecharModal();
    carregarEquipamentos();
}

// Excluir equipamento
function excluirEquipamento(id) {
    if (!confirm('Tem certeza que deseja excluir este equipamento?')) return;
    
    const equipamentos = obterDados('equipamentos');
    const novosEquipamentos = equipamentos.filter(e => e.id !== id);
    salvarDados('equipamentos', novosEquipamentos);
    
    alert('✅ Equipamento excluído com sucesso!');
    carregarEquipamentos();
}

// Filtrar equipamentos
function filtrarEquipamentos() {
    const busca = document.getElementById('busca').value.toLowerCase();
    const fornecedorId = document.getElementById('filtro-fornecedor').value;
    const status = document.getElementById('filtro-status').value;
    
    let equipamentos = obterDados('equipamentos');
    
    // Filtro de busca
    if (busca) {
        equipamentos = equipamentos.filter(e => 
            e.codigo.toLowerCase().includes(busca) ||
            e.nome.toLowerCase().includes(busca)
        );
    }
    
    // Filtro de fornecedor
    if (fornecedorId) {
        equipamentos = equipamentos.filter(e => e.fornecedorId === fornecedorId);
    }
    
    // Filtro de status
    if (status) {
        equipamentos = equipamentos.filter(e => {
            const st = obterStatusEquipamento(e);
            return st.status === status;
        });
    }
    
    const tbody = document.getElementById('tabela-equipamentos');
    const fornecedores = obterDados('fornecedores');
    
    if (equipamentos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center" style="padding: 2rem; color: var(--gray);">
                    Nenhum equipamento encontrado
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = equipamentos.map(eq => {
        const statusData = obterStatusEquipamento(eq);
        
        return `
            <tr>
                <td><strong>${eq.codigo}</strong></td>
                <td>${eq.nome}</td>
                <td>${eq.qtdNovos}</td>
                <td>${eq.qtdUsados}</td>
                <td><strong>${eq.qtdAtual}</strong></td>
                <td>${eq.estoqueMinimo}</td>
                <td>R$ ${eq.custo.toFixed(2)}</td>
                <td>${eq.comprasChegar || 0}</td>
                <td>${statusData.badge}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="editarEquipamento('${eq.id}')">
                        ✏️
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="excluirEquipamento('${eq.id}')">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function limparFormulario() {
    document.getElementById('form-equipamento').reset();
}

function fecharModal() {
    document.getElementById('modal-editar').classList.remove('active');
}

// ========================================
// MOVIMENTAÇÕES
// ========================================

// Carregar equipamentos no select de movimentações
function carregarEquipamentosSelectMovimentacao() {
    const equipamentos = obterDados('equipamentos');
    const select = document.getElementById('equipamento-movimentacao');
    
    if (!select) return;
    
    select.innerHTML = '<option value="">Selecione um equipamento</option>';
    
    equipamentos.forEach(eq => {
        const option = document.createElement('option');
        option.value = eq.id;
        option.textContent = `${eq.codigo} - ${eq.nome} (Atual: ${eq.qtdAtual})`;
        select.appendChild(option);
    });
}

// Salvar movimentação
function salvarMovimentacao(e) {
    e.preventDefault();
    
    const equipamentoId = document.getElementById('equipamento-movimentacao').value;
    const tipo = document.getElementById('tipo-movimentacao').value;
    const condicao = document.getElementById('condicao').value;
    const quantidade = parseInt(document.getElementById('quantidade').value);
    
    // Validar estoque para saída
    if (tipo === 'saida') {
        const equipamentos = obterDados('equipamentos');
        const equipamento = equipamentos.find(e => e.id === equipamentoId);
        
        if (!equipamento) {
            alert('❌ Equipamento não encontrado!');
            return;
        }
        
        const qtdDisponivel = condicao === 'novo' ? equipamento.qtdNovos : equipamento.qtdUsados;
        
        if (quantidade > qtdDisponivel) {
            alert(`❌ Quantidade insuficiente! Disponível: ${qtdDisponivel} ${condicao}(s)`);
            return;
        }
    }
    
    const movimentacao = {
        id: gerarId(),
        equipamentoId: equipamentoId,
        tipo: tipo,
        condicao: condicao,
        quantidade: quantidade,
        data: document.getElementById('data-movimentacao').value,
        responsavel: document.getElementById('responsavel').value,
        observacao: document.getElementById('observacao').value,
        dataRegistro: new Date().toISOString()
    };
    
    const movimentacoes = obterDados('movimentacoes');
    movimentacoes.push(movimentacao);
    salvarDados('movimentacoes', movimentacoes);
    
    // Atualizar estoque do equipamento
    atualizarEstoqueEquipamento(equipamentoId, tipo, condicao, quantidade);
    
    alert('✅ Movimentação registrada com sucesso!');
    limparFormularioMovimentacao();
    carregarMovimentacoes();
    carregarEquipamentosSelectMovimentacao();
}

// Atualizar estoque do equipamento
function atualizarEstoqueEquipamento(equipamentoId, tipo, condicao, quantidade) {
    const equipamentos = obterDados('equipamentos');
    const index = equipamentos.findIndex(e => e.id === equipamentoId);
    
    if (index === -1) return;
    
    if (tipo === 'entrada') {
        if (condicao === 'novo') {
            equipamentos[index].qtdNovos += quantidade;
        } else {
            equipamentos[index].qtdUsados += quantidade;
        }
    } else if (tipo === 'saida') {
        if (condicao === 'novo') {
            equipamentos[index].qtdNovos -= quantidade;
        } else {
            equipamentos[index].qtdUsados -= quantidade;
        }
    }
    
    equipamentos[index].qtdAtual = equipamentos[index].qtdNovos + equipamentos[index].qtdUsados;
    salvarDados('equipamentos', equipamentos);
}

// Carregar movimentações
function carregarMovimentacoes() {
    const movimentacoes = obterDados('movimentacoes');
    const equipamentos = obterDados('equipamentos');
    const tbody = document.getElementById('tabela-movimentacoes');
    const total = document.getElementById('total-movimentacoes');
    
    if (total) {
        total.textContent = `${movimentacoes.length} movimentaç${movimentacoes.length !== 1 ? 'ões' : 'ão'}`;
    }
    
    if (!tbody) return;
    
    if (movimentacoes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center" style="padding: 2rem; color: var(--gray);">
                    Nenhuma movimentação registrada
                </td>
            </tr>
        `;
        return;
    }
    
    // Ordenar por data (mais recente primeiro)
    const movimentacoesOrdenadas = [...movimentacoes].sort((a, b) => 
        new Date(b.data) - new Date(a.data)
    );
    
    tbody.innerHTML = movimentacoesOrdenadas.map(m => {
        const equipamento = equipamentos.find(e => e.id === m.equipamentoId);
        const nomeEquipamento = equipamento ? `${equipamento.codigo} - ${equipamento.nome}` : 'Equipamento não encontrado';
        const dataFormatada = new Date(m.data).toLocaleDateString('pt-BR');
        const tipoBadge = m.tipo === 'entrada' 
            ? '<span class="badge badge-success">📥 Entrada</span>' 
            : '<span class="badge badge-danger">📤 Saída</span>';
        
        return `
            <tr>
                <td>${dataFormatada}</td>
                <td>${tipoBadge}</td>
                <td>${nomeEquipamento}</td>
                <td><span class="badge badge-info">${m.condicao}</span></td>
                <td><strong>${m.quantidade}</strong></td>
                <td>${m.responsavel}</td>
                <td>${m.observacao || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="excluirMovimentacao('${m.id}')">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Excluir movimentação
function excluirMovimentacao(id) {
    if (!confirm('Tem certeza que deseja excluir esta movimentação? ATENÇÃO: O estoque NÃO será revertido automaticamente.')) return;
    
    const movimentacoes = obterDados('movimentacoes');
    const novasMovimentacoes = movimentacoes.filter(m => m.id !== id);
    salvarDados('movimentacoes', novasMovimentacoes);
    
    alert('✅ Movimentação excluída com sucesso!');
    carregarMovimentacoes();
}

// Filtrar movimentações
function filtrarMovimentacoes() {
    const busca = document.getElementById('busca-movimentacao').value.toLowerCase();
    const tipo = document.getElementById('filtro-tipo').value;
    const dataInicio = document.getElementById('filtro-data-inicio').value;
    const dataFim = document.getElementById('filtro-data-fim').value;
    
    let movimentacoes = obterDados('movimentacoes');
    const equipamentos = obterDados('equipamentos');
    
    // Filtro de busca
    if (busca) {
        movimentacoes = movimentacoes.filter(m => {
            const equipamento = equipamentos.find(e => e.id === m.equipamentoId);
            const nomeEquipamento = equipamento ? `${equipamento.codigo} ${equipamento.nome}` : '';
            return nomeEquipamento.toLowerCase().includes(busca) ||
                   m.responsavel.toLowerCase().includes(busca);
        });
    }
    
    // Filtro de tipo
    if (tipo) {
        movimentacoes = movimentacoes.filter(m => m.tipo === tipo);
    }
    
    // Filtro de data
    if (dataInicio) {
        movimentacoes = movimentacoes.filter(m => m.data >= dataInicio);
    }
    if (dataFim) {
        movimentacoes = movimentacoes.filter(m => m.data <= dataFim);
    }
    
    const tbody = document.getElementById('tabela-movimentacoes');
    
    if (movimentacoes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center" style="padding: 2rem; color: var(--gray);">
                    Nenhuma movimentação encontrada
                </td>
            </tr>
        `;
        return;
    }
    
    const movimentacoesOrdenadas = [...movimentacoes].sort((a, b) => 
        new Date(b.data) - new Date(a.data)
    );
    
    tbody.innerHTML = movimentacoesOrdenadas.map(m => {
        const equipamento = equipamentos.find(e => e.id === m.equipamentoId);
        const nomeEquipamento = equipamento ? `${equipamento.codigo} - ${equipamento.nome}` : 'Equipamento não encontrado';
        const dataFormatada = new Date(m.data).toLocaleDateString('pt-BR');
        const tipoBadge = m.tipo === 'entrada' 
            ? '<span class="badge badge-success">📥 Entrada</span>' 
            : '<span class="badge badge-danger">📤 Saída</span>';
        
        return `
            <tr>
                <td>${dataFormatada}</td>
                <td>${tipoBadge}</td>
                <td>${nomeEquipamento}</td>
                <td><span class="badge badge-info">${m.condicao}</span></td>
                <td><strong>${m.quantidade}</strong></td>
                <td>${m.responsavel}</td>
                <td>${m.observacao || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="excluirMovimentacao('${m.id}')">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function limparFormularioMovimentacao() {
    document.getElementById('form-movimentacao').reset();
    document.getElementById('data-movimentacao').valueAsDate = new Date();
}

// ========================================
// DASHBOARD
// ========================================

// Carregar KPIs do dashboard
function carregarDashboard() {
    const equipamentos = obterDados('equipamentos');
    const movimentacoes = obterDados('movimentacoes');
    
    // Total de equipamentos
    const totalEquipamentos = equipamentos.reduce((sum, eq) => sum + eq.qtdAtual, 0);
    document.getElementById('total-equipamentos').textContent = totalEquipamentos;
    
    // Valor total em estoque
    const valorTotal = equipamentos.reduce((sum, eq) => sum + (eq.qtdAtual * eq.custo), 0);
    document.getElementById('valor-total').textContent = `R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    
    // Equipamentos com estoque baixo
    const estoqueBaixo = equipamentos.filter(eq => eq.qtdAtual < eq.estoqueMinimo).length;
    document.getElementById('estoque-baixo').textContent = estoqueBaixo;
    
    // Movimentações do mês atual
    const dataAtual = new Date();
    const mesAtual = dataAtual.getMonth();
    const anoAtual = dataAtual.getFullYear();
    
    const movimentacoesMes = movimentacoes.filter(m => {
        const dataMovimentacao = new Date(m.data);
        return dataMovimentacao.getMonth() === mesAtual && 
               dataMovimentacao.getFullYear() === anoAtual;
    }).length;
    
    document.getElementById('movimentacoes-mes').textContent = movimentacoesMes;
}

// Carregar equipamentos com estoque baixo
function carregarEquipamentosBaixoEstoque() {
    const equipamentos = obterDados('equipamentos');
    const tbody = document.getElementById('estoque-baixo-table');
    
    if (!tbody) return;
    
    const equipamentosBaixo = equipamentos.filter(eq => eq.qtdAtual < eq.estoqueMinimo);
    
    if (equipamentosBaixo.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center" style="padding: 2rem; color: var(--gray);">
                    Nenhum equipamento com estoque baixo
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = equipamentosBaixo.map(eq => {
        const status = obterStatusEquipamento(eq);
        
        return `
            <tr>
                <td><strong>${eq.codigo}</strong></td>
                <td>${eq.nome}</td>
                <td>${eq.qtdNovos}</td>
                <td>${eq.qtdUsados}</td>
                <td><strong>${eq.qtdAtual}</strong></td>
                <td>${eq.estoqueMinimo}</td>
                <td>${status.badge}</td>
                <td>
                    <a href="equipamentos.html" class="btn btn-sm btn-primary">
                        Ver Detalhes
                    </a>
                </td>
            </tr>
        `;
    }).join('');
}

// Carregar últimas movimentações
function carregarUltimasMovimentacoes() {
    const movimentacoes = obterDados('movimentacoes');
    const equipamentos = obterDados('equipamentos');
    const tbody = document.getElementById('ultimas-movimentacoes');
    
    if (!tbody) return;
    
    if (movimentacoes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center" style="padding: 2rem; color: var(--gray);">
                    Nenhuma movimentação registrada
                </td>
            </tr>
        `;
        return;
    }
    
    // Mostrar as últimas 10 movimentações
    const ultimasMovimentacoes = [...movimentacoes]
        .sort((a, b) => new Date(b.data) - new Date(a.data))
        .slice(0, 10);
    
    tbody.innerHTML = ultimasMovimentacoes.map(m => {
        const equipamento = equipamentos.find(e => e.id === m.equipamentoId);
        const nomeEquipamento = equipamento ? `${equipamento.codigo} - ${equipamento.nome}` : 'Equipamento não encontrado';
        const dataFormatada = new Date(m.data).toLocaleDateString('pt-BR');
        const tipoBadge = m.tipo === 'entrada' 
            ? '<span class="badge badge-success">📥 Entrada</span>' 
            : '<span class="badge badge-danger">📤 Saída</span>';
        const statusBadge = '<span class="badge badge-info">✅ Concluída</span>';
        
        return `
            <tr>
                <td>${dataFormatada}</td>
                <td>${tipoBadge}</td>
                <td>${nomeEquipamento}</td>
                <td><strong>${m.quantidade}</strong></td>
                <td>${m.responsavel}</td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

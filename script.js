const SUPABASE_URL = "https://pyvflefybxejtrqanzls.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0qAtlmAMZD_WUPVUSqYEtg_JUTyjl-X";
const STORAGE_BUCKET = "IMG-adega";

// `supabase` (minúsculo) é o objeto global vindo do CDN carregado no index.html.
// Criamos nosso cliente com outro nome para não confundir os dois.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// ESTADO EM MEMÓRIA
// ============================================================
let products = [];
let cart = [];
let currentUser = null;
let isAdmin = false;
let editingProductId = null;

// ============================================================
// NOTIFICAÇÕES (toast) — substituem os alert() nativos do navegador
// ============================================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icones = {
        success: 'fa-circle-check',
        error: 'fa-circle-exclamation',
        info: 'fa-circle-info'
    };

    const toast = document.createElement('div');
    toast.classList.add('toast', `toast-${type}`);
    toast.innerHTML = `
        <i class="fa-solid ${icones[type] || icones.info}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3200);
}

// ============================================================
// NAVEGAÇÃO ENTRE SEÇÕES (SPA)
// ============================================================
function showSection(sectionId) {
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => section.classList.add('hidden'));

    const targetSection = document.getElementById(`section-${sectionId}`);
    if (targetSection) targetSection.classList.remove('hidden');

    document.querySelectorAll('.menu-item[data-section]').forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionId);
    });

    document.getElementById('cart-modal').classList.remove('open');

    if (sectionId === 'pedidos') loadOrders();
    if (sectionId === 'admin') loadAdminProducts();
}

function toggleCart() {
    document.getElementById('cart-modal').classList.toggle('open');
}

// ============================================================
// PRODUTOS — carregados do Supabase
// ============================================================
async function loadProducts() {
    const grid = document.getElementById('products-grid');

    const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error('Erro ao carregar produtos:', error);
        grid.innerHTML = '<p>Não foi possível carregar o catálogo agora. Tente novamente mais tarde.</p>';
        return;
    }

    products = data;
    renderProducts();
}

function renderProducts() {
    const grid = document.getElementById('products-grid');
    grid.innerHTML = '';

    products.forEach(product => {
        const card = document.createElement('div');
        card.classList.add('product-card');

        card.innerHTML = `
            ${product.badge ? `<div class="product-badge">${product.badge}</div>` : ''}
            <img src="${product.image_url}" alt="${product.name}">
            <h3>${product.name}</h3>
            <p class="product-price">${formatarPreco(product.price)}</p>
            <button class="add-to-cart-btn" data-id="${product.id}">Adicionar ao Carrinho</button>
        `;

        card.querySelector('.add-to-cart-btn').addEventListener('click', () => {
            addToCart(product.id);
        });

        grid.appendChild(card);
    });
}

function formatarPreco(valor) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ============================================================
// CARRINHO — em memória para visitantes, persistido no Supabase
// para usuários logados (tabela "cart_items")
// ============================================================
async function addToCart(productId) {
    const produto = products.find(p => p.id === productId);
    if (!produto) return;

    if (currentUser) {
        await addToCartSupabase(productId);
    } else {
        const itemExistente = cart.find(item => item.product_id === productId);
        if (itemExistente) {
            itemExistente.quantity += 1;
        } else {
            cart.push({ product_id: productId, name: produto.name, price: produto.price, quantity: 1 });
        }
        updateCartUI();
    }

    showToast(`${produto.name} foi adicionado ao carrinho!`, 'success');
}

async function addToCartSupabase(productId) {
    // Verifica se o item já existe no carrinho do usuário no banco
    const { data: existente, error: erroConsulta } = await supabaseClient
        .from('cart_items')
        .select('id, quantity')
        .eq('user_id', currentUser.id)
        .eq('product_id', productId)
        .maybeSingle();

    if (erroConsulta) {
        console.error('Erro ao consultar carrinho:', erroConsulta);
        return;
    }

    if (existente) {
        await supabaseClient
            .from('cart_items')
            .update({ quantity: existente.quantity + 1 })
            .eq('id', existente.id);
    } else {
        await supabaseClient
            .from('cart_items')
            .insert({ user_id: currentUser.id, product_id: productId, quantity: 1 });
    }

    await loadCartFromSupabase();
}

async function removeFromCart(productId) {
    if (currentUser) {
        await removeFromCartSupabase(productId);
        return;
    }

    const itemIndex = cart.findIndex(item => item.product_id === productId);
    if (itemIndex > -1) {
        if (cart[itemIndex].quantity > 1) {
            cart[itemIndex].quantity -= 1;
        } else {
            cart.splice(itemIndex, 1);
        }
    }
    updateCartUI();
}

async function removeFromCartSupabase(productId) {
    const { data: existente, error: erroConsulta } = await supabaseClient
        .from('cart_items')
        .select('id, quantity')
        .eq('user_id', currentUser.id)
        .eq('product_id', productId)
        .maybeSingle();

    if (erroConsulta || !existente) return;

    if (existente.quantity > 1) {
        await supabaseClient
            .from('cart_items')
            .update({ quantity: existente.quantity - 1 })
            .eq('id', existente.id);
    } else {
        await supabaseClient
            .from('cart_items')
            .delete()
            .eq('id', existente.id);
    }

    await loadCartFromSupabase();
}

// Busca o carrinho salvo do usuário logado, já trazendo nome/preço do
// produto relacionado
async function loadCartFromSupabase() {
    const { data, error } = await supabaseClient
        .from('cart_items')
        .select('quantity, product_id, products(name, price)')
        .eq('user_id', currentUser.id);

    if (error) {
        console.error('Erro ao carregar carrinho:', error);
        return;
    }

    cart = data.map(item => ({
        product_id: item.product_id,
        name: item.products.name,
        price: item.products.price,
        quantity: item.quantity
    }));

    updateCartUI();
}

async function clearCartInSupabase() {
    if (!currentUser) return;
    await supabaseClient.from('cart_items').delete().eq('user_id', currentUser.id);
}

function updateCartUI() {
    const cartContainer = document.getElementById('cart-items-container');
    const cartCountTop = document.getElementById('cart-count-top');
    const cartCountSide = document.getElementById('cart-count-side');
    const cartTotalValue = document.getElementById('cart-total-value');

    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
    cartCountTop.textContent = totalItems;
    cartCountSide.textContent = totalItems;

    const totalPrice = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    cartTotalValue.textContent = formatarPreco(totalPrice);

    cartContainer.innerHTML = '';

    if (cart.length === 0) {
        cartContainer.innerHTML = '<p class="empty-cart-msg">Seu carrinho está vazio.</p>';
        return;
    }

    cart.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('cart-item');
        itemElement.innerHTML = `
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <p>${item.quantity}x - ${formatarPreco(item.price * item.quantity)}</p>
            </div>
            <button class="remove-item-btn" data-id="${item.product_id}">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        itemElement.querySelector('.remove-item-btn').addEventListener('click', () => {
            removeFromCart(item.product_id);
        });
        cartContainer.appendChild(itemElement);
    });
}

// ============================================================
// AUTENTICAÇÃO — Supabase Auth (login/cadastro/logout reais)
// ============================================================
function toggleAuthForms() {
    document.getElementById('login-form-card').classList.toggle('hidden');
    document.getElementById('register-form-card').classList.toggle('hidden');
}

async function handleRegister(event) {
    event.preventDefault();

    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { name } }
    });

    if (error) {
        showToast(`Erro ao cadastrar: ${error.message}`, 'error');
        return;
    }

    showToast('Cadastro realizado! Verifique seu e-mail para confirmar a conta antes de fazer login.', 'success');

    document.getElementById('reg-name').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-password').value = '';
    toggleAuthForms();
}

async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        showToast(`E-mail ou senha incorretos. (${error.message})`, 'error');
        return;
    }

    document.getElementById('login-password').value = '';
    showSection('produtos');
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    showSection('produtos');
}

function updateAuthUI(user) {
    const menuUserText = document.getElementById('menu-user-text');
    const loginCard = document.getElementById('login-form-card');
    const registerCard = document.getElementById('register-form-card');
    const profileCard = document.getElementById('profile-card');
    const menuPedidos = document.getElementById('menu-pedidos');
    const menuAdmin = document.getElementById('menu-admin');

    menuPedidos.classList.toggle('hidden', !user);
    menuAdmin.classList.toggle('hidden', !isAdmin);

    if (user) {
        const nome = user.user_metadata?.name || user.email;
        if (menuUserText) menuUserText.textContent = `Olá, ${nome.split(' ')[0]}`;

        loginCard.classList.add('hidden');
        registerCard.classList.add('hidden');
        profileCard.classList.remove('hidden');

        document.getElementById('profile-name').textContent = nome;
        document.getElementById('profile-email').textContent = user.email;
    } else {
        if (menuUserText) menuUserText.textContent = 'Minha Conta';

        loginCard.classList.remove('hidden');
        registerCard.classList.add('hidden');
        profileCard.classList.add('hidden');
    }
}

// Consulta a tabela profiles para saber se o usuário logado é admin
async function checkIsAdmin(userId) {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.error('Erro ao verificar permissão de admin:', error);
        return false;
    }

    return data?.is_admin || false;
}

// Centraliza tudo que precisa acontecer sempre que o usuário muda
// (login, logout, refresh da página): quem é, se é admin, carrinho e UI.
async function refreshUserContext(user) {
    currentUser = user;
    isAdmin = user ? await checkIsAdmin(user.id) : false;
    updateAuthUI(currentUser);

    if (currentUser) {
        await loadCartFromSupabase();
    } else {
        cart = [];
        updateCartUI();
    }
}

// Reage a qualquer mudança de sessão: login, logout, token renovado, etc.
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    // Caso especial: usuário clicou no link de "esqueci minha senha".
    // Em vez de logar normalmente, mostramos a tela pra ele escolher uma senha nova.
    if (event === 'PASSWORD_RECOVERY') {
        document.getElementById('reset-password-overlay').classList.remove('hidden');
        return;
    }

    await refreshUserContext(session?.user || null);
});

async function handleResetPassword(event) {
    event.preventDefault();

    const novaSenha = document.getElementById('reset-password-input').value;

    const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });

    if (error) {
        showToast(`Erro ao definir nova senha: ${error.message}`, 'error');
        return;
    }

    showToast('Senha atualizada com sucesso! Você já está logado.', 'success');
    document.getElementById('reset-password-overlay').classList.add('hidden');
    document.getElementById('reset-password-form').reset();

    const { data: { session } } = await supabaseClient.auth.getSession();
    await refreshUserContext(session?.user || null);
    showSection('produtos');
}

// ============================================================
// FINALIZAÇÃO DA COMPRA
// ============================================================
async function checkout() {
    if (cart.length === 0) {
        showToast('Seu carrinho está vazio! Adicione algum item antes de finalizar.', 'error');
        return;
    }

    if (currentUser) {
        const sucesso = await salvarPedido();
        if (!sucesso) {
            showToast('Não foi possível registrar seu pedido agora. Tente novamente em instantes.', 'error');
            return;
        }
        await clearCartInSupabase();
    } else {
        // Visitante sem login: a compra acontece, mas não fica salva em
        // "Meus Pedidos" (isso exige uma conta, para sabermos de quem é o pedido).
    }

    showToast('Pedido recebido! Será preparado e entregue saindo do nosso endereço no Roça Grande em Colombo.', 'success');

    cart = [];
    updateCartUI();
    toggleCart();
}

// Grava o pedido (orders) e seus itens (order_items) no banco.
// Retorna true/false para indicar sucesso.
async function salvarPedido() {
    const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

    const { data: pedido, error: erroPedido } = await supabaseClient
        .from('orders')
        .insert({ user_id: currentUser.id, total })
        .select('id')
        .single();

    if (erroPedido) {
        console.error('Erro ao criar pedido:', erroPedido);
        return false;
    }

    const itens = cart.map(item => ({
        order_id: pedido.id,
        product_id: item.product_id,
        product_name: item.name,
        unit_price: item.price,
        quantity: item.quantity
    }));

    const { error: erroItens } = await supabaseClient.from('order_items').insert(itens);

    if (erroItens) {
        console.error('Erro ao salvar itens do pedido:', erroItens);
        return false;
    }

    return true;
}

// ============================================================
// HISTÓRICO DE PEDIDOS ("Meus Pedidos")
// ============================================================
async function loadOrders() {
    const container = document.getElementById('orders-container');

    if (!currentUser) {
        container.innerHTML = '<p id="orders-empty-msg">Faça login para ver seus pedidos.</p>';
        return;
    }

    const { data, error } = await supabaseClient
        .from('orders')
        .select('id, total, created_at, order_items(product_name, unit_price, quantity)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Erro ao carregar pedidos:', error);
        container.innerHTML = '<p>Não foi possível carregar seus pedidos agora.</p>';
        return;
    }

    renderOrders(data);
}

function renderOrders(orders) {
    const container = document.getElementById('orders-container');
    container.innerHTML = '';

    if (orders.length === 0) {
        container.innerHTML = '<p id="orders-empty-msg">Você ainda não fez nenhum pedido.</p>';
        return;
    }

    orders.forEach(order => {
        const dataFormatada = new Date(order.created_at).toLocaleString('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short'
        });

        const card = document.createElement('div');
        card.classList.add('order-card');

        const itensHtml = order.order_items.map(item => `
            <div class="order-item-row">
                <span>${item.quantity}x ${item.product_name}</span>
                <span>${formatarPreco(item.unit_price * item.quantity)}</span>
            </div>
        `).join('');

        card.innerHTML = `
            <div class="order-header">
                <span class="order-id">Pedido #${order.id}</span>
                <span class="order-date">${dataFormatada}</span>
            </div>
            <div class="order-items">${itensHtml}</div>
            <div class="order-total-row">
                <strong>Total</strong>
                <strong>${formatarPreco(order.total)}</strong>
            </div>
        `;

        container.appendChild(card);
    });
}

async function loadAdminProducts() {

    if (products.length === 0) {
        await loadProducts();
    }
    renderAdminProducts();
}

function renderAdminProducts() {
    const list = document.getElementById('admin-products-list');
    list.innerHTML = '';

    if (products.length === 0) {
        list.innerHTML = '<p>Nenhum produto cadastrado ainda.</p>';
        return;
    }

    products.forEach(product => {
        const row = document.createElement('div');
        row.classList.add('admin-product-row');

        if (editingProductId === product.id) {
            row.innerHTML = `
                <div class="admin-product-edit-form">
                    <input type="text" class="edit-name" value="${product.name}">
                    <input type="number" step="0.01" min="0" class="edit-price" value="${product.price}">
                    <input type="text" class="edit-image" value="${product.image_url || ''}" placeholder="URL da imagem">
                    <input type="file" class="edit-image-file" accept="image/*">
                    <input type="text" class="edit-badge" value="${product.badge || ''}" placeholder="Selo (opcional)">
                </div>
                <div class="admin-product-actions">
                    <button class="save-btn">Salvar</button>
                    <button class="cancel-btn">Cancelar</button>
                </div>
            `;

            row.querySelector('.save-btn').addEventListener('click', async () => {
                const nome = row.querySelector('.edit-name').value.trim();
                const preco = parseFloat(row.querySelector('.edit-price').value);
                const urlDigitada = row.querySelector('.edit-image').value.trim();
                const selo = row.querySelector('.edit-badge').value.trim();
                const arquivoSelecionado = row.querySelector('.edit-image-file').files[0];

                const urlDoUpload = await uploadProductImage(arquivoSelecionado);
                if (arquivoSelecionado && !urlDoUpload) return; // upload falhou

                const imagem = urlDoUpload || urlDigitada;
                handleAdminSaveProduct(product.id, nome, preco, imagem, selo);
            });
            row.querySelector('.cancel-btn').addEventListener('click', () => {
                editingProductId = null;
                renderAdminProducts();
            });
        } else {
            row.innerHTML = `
                <img src="${product.image_url}" alt="${product.name}">
                <div class="admin-product-info">
                    <strong>${product.name}</strong>
                    <span>${formatarPreco(product.price)}${product.badge ? ` · ${product.badge}` : ''}</span>
                </div>
                <div class="admin-product-actions">
                    <button class="edit-btn">Editar</button>
                    <button class="delete-btn">Excluir</button>
                </div>
            `;

            row.querySelector('.edit-btn').addEventListener('click', () => {
                editingProductId = product.id;
                renderAdminProducts();
            });
            row.querySelector('.delete-btn').addEventListener('click', () => {
                handleAdminDeleteProduct(product.id, product.name);
            });
        }

        list.appendChild(row);
    });
}

// Envia um arquivo de imagem para o Supabase Storage e devolve a URL pública.
// Retorna null se não houver arquivo selecionado ou se der erro.
async function uploadProductImage(file) {
    if (!file) return null;

    // Nome único pra evitar sobrescrever outra imagem com o mesmo nome
    const nomeArquivo = `${Date.now()}-${file.name}`;

    const { error } = await supabaseClient.storage
        .from(STORAGE_BUCKET)
        .upload(nomeArquivo, file);

    if (error) {
        showToast(`Erro ao enviar a imagem: ${error.message}`, 'error');
        return null;
    }

    const { data } = supabaseClient.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(nomeArquivo);

    return data.publicUrl;
}

async function handleAdminAddProduct(event) {
    event.preventDefault();

    const nome = document.getElementById('admin-name').value.trim();
    const preco = parseFloat(document.getElementById('admin-price').value);
    const urlDigitada = document.getElementById('admin-image').value.trim();
    const selo = document.getElementById('admin-badge').value.trim();
    const arquivoSelecionado = document.getElementById('admin-image-file').files[0];

    // Se um arquivo foi escolhido, ele tem prioridade sobre a URL digitada
    const urlDoUpload = await uploadProductImage(arquivoSelecionado);
    if (arquivoSelecionado && !urlDoUpload) return;

    const imagem = urlDoUpload || urlDigitada;

    const { error } = await supabaseClient.from('products').insert({
        name: nome,
        price: preco,
        image_url: imagem || null,
        badge: selo || null
    });

    if (error) {
        showToast(`Erro ao adicionar produto: ${error.message}`, 'error');
        return;
    }

    event.target.reset();
    await loadProducts();
    renderAdminProducts();
}

async function handleAdminSaveProduct(id, nome, preco, imagem, selo) {
    const { error } = await supabaseClient
        .from('products')
        .update({ name: nome, price: preco, image_url: imagem || null, badge: selo || null })
        .eq('id', id);

    if (error) {
        showToast(`Erro ao salvar produto: ${error.message}`, 'error');
        return;
    }

    editingProductId = null;
    await loadProducts();
    renderAdminProducts();
}

async function handleAdminDeleteProduct(id, nome) {
    const confirmado = confirm(`Excluir "${nome}" do catálogo? Essa ação não pode ser desfeita.`);
    if (!confirmado) return;

    const { error } = await supabaseClient.from('products').delete().eq('id', id);

    if (error) {
        showToast(`Erro ao excluir produto: ${error.message}`, 'error');
        return;
    }

    await loadProducts();
    renderAdminProducts();
}

// ============================================================
// TEMA CLARO/ESCURO (preferência de interface, não precisa de banco)
// ============================================================
function applyTheme(theme) {
    const body = document.body;
    const themeIcon = document.getElementById('theme-icon');
    if (!themeIcon) return;

    const isDark = theme === 'dark';
    body.classList.toggle('dark-theme', isDark);

    themeIcon.classList.toggle('fa-moon', !isDark);
    themeIcon.classList.toggle('fa-sun', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function toggleTheme() {
    const currentTheme = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
    applyTheme(currentTheme);
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    applyTheme(savedTheme === 'dark' ? 'dark' : 'light');
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await loadProducts();

    // Recupera a sessão já ativa (se o usuário deu refresh na página, por exemplo)
    const { data: { session } } = await supabaseClient.auth.getSession();
    await refreshUserContext(session?.user || null);

    document.getElementById('admin-add-form').addEventListener('submit', handleAdminAddProduct);
    document.getElementById('reset-password-form').addEventListener('submit', handleResetPassword);
});
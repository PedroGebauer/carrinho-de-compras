// Banco de dados em memória do Carrinho de Compras
let cart = [];

// Função para alternar entre as seções visíveis do site (Navegação SPA)
function showSection(sectionId) {
    const sectionProdutos = document.getElementById('section-produtos');
    const sectionLogin = document.getElementById('section-login');
    
    // Atualiza a classe ativa no menu lateral
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => item.classList.remove('active'));

    if (sectionId === 'produtos' || sectionId === 'home') {
        sectionProdutos.classList.remove('hidden');
        sectionLogin.classList.add('hidden');
        // Define o item "Início" ou "Produtos" como ativo
        if(sectionId === 'home') menuItems[0].classList.add('active');
        else menuItems[1].classList.add('active');
    } else if (sectionId === 'login') {
        sectionProdutos.classList.add('hidden');
        sectionLogin.classList.remove('hidden');
        menuItems[3].classList.add('active');
    }
    
    // Fecha o carrinho caso esteja aberto ao navegar
    document.getElementById('cart-modal').classList.remove('open');
}

// Abre/Fecha a gaveta do carrinho de compras
function toggleCart() {
    const cartModal = document.getElementById('cart-modal');
    cartModal.classList.toggle('open');
}

// Adiciona um item ao carrinho
function addToCart(productName, price) {
    // Procura se o produto já existe no carrinho para somar quantidade
    const existingItem = cart.find(item => item.name === productName);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            name: productName,
            price: price,
            quantity: 1
        });
    }
    
    updateCartUI();
    
    // Feedback visual rápido de sucesso
    alert(`${productName} foi adicionado ao carrinho!`);
}

// Remove uma unidade ou deleta o produto do carrinho
function removeFromCart(productName) {
    const itemIndex = cart.findIndex(item => item.name === productName);
    
    if (itemIndex > -1) {
        if (cart[itemIndex].quantity > 1) {
            cart[itemIndex].quantity -= 1;
        } else {
            cart.splice(itemIndex, 1);
        }
    }
    updateCartUI();
}

// Atualiza toda a interface gráfica do carrinho e contadores
function updateCartUI() {
    const cartContainer = document.getElementById('cart-items-container');
    const cartCountTop = document.getElementById('cart-count-top');
    const cartCountSide = document.getElementById('cart-count-side');
    const cartTotalValue = document.getElementById('cart-total-value');
    
    // Calcula o total de itens (quantidade somada)
    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
    cartCountTop.textContent = totalItems;
    cartCountSide.textContent = totalItems;
    
    // Calcula o preço acumulado total
    const totalPrice = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    cartTotalValue.textContent = totalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    // Limpa a lista atual para renderizar o novo estado
    cartContainer.innerHTML = '';
    
    if (cart.length === 0) {
        cartContainer.innerHTML = '<p class="empty-cart-msg">Seu carrinho está vazio.</p>';
        return;
    }
    
    // Desenha cada item na tela do carrinho
    cart.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('cart-item');
        itemElement.innerHTML = `
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <p>${item.quantity}x - ${(item.price * item.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            </div>
            <button class="remove-item-btn" onclick="removeFromCart('${item.name}')">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        cartContainer.appendChild(itemElement);
    });
}

// Alterna entre a tela de Login e a tela de Cadastro
function toggleAuthForms() {
    document.getElementById('login-form-card').classList.toggle('hidden');
    document.getElementById('register-form-card').classList.toggle('hidden');
}

// Lógica de Cadastro
function handleRegister(event) {
    event.preventDefault(); // Evita recarregar a página
    
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    // Puxa a lista de usuários salvos (se não existir, cria uma lista vazia)
    let users = JSON.parse(localStorage.getItem('adega_users')) || [];

    // Verifica se o e-mail já existe no "banco de dados"
    const userExists = users.find(u => u.email === email);
    if (userExists) {
        alert("Este e-mail já está cadastrado!");
        return;
    }

    // Salva o novo usuário
    users.push({ name, email, password });
    localStorage.setItem('adega_users', JSON.stringify(users));

    alert("Cadastro realizado com sucesso! Faça o login.");
    
    // Limpa os campos e volta para a tela de login
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-password').value = '';
    toggleAuthForms(); 
}

// Lógica de Login
function handleLogin(event) {
    event.preventDefault(); 
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    let users = JSON.parse(localStorage.getItem('adega_users')) || [];
    
    // Procura se o e-mail e a senha batem com algum cadastro
    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
        // Salva a sessão do usuário como "logado"
        localStorage.setItem('adega_logged_in_user', JSON.stringify(user));
        alert(`Bem-vindo de volta, ${user.name}!`);
        
        // Limpa os campos de senha
        document.getElementById('login-password').value = '';
        
        updateAuthUI(); // Atualiza a tela
        showSection('produtos'); // Redireciona para os produtos
    } else {
        alert("E-mail ou senha incorretos.");
    }
}

// Lógica de Sair (Logout)
function handleLogout() {
    localStorage.removeItem('adega_logged_in_user'); // Remove a sessão
    updateAuthUI();
    showSection('home');
}

// Função para atualizar o visual baseando-se se está logado ou não
function updateAuthUI() {
    const loggedInUser = JSON.parse(localStorage.getItem('adega_logged_in_user'));
    
    const menuUserText = document.getElementById('menu-user-text');
    const loginCard = document.getElementById('login-form-card');
    const registerCard = document.getElementById('register-form-card');
    const profileCard = document.getElementById('profile-card');

    if (loggedInUser) {
        // Se estiver logado
        if (menuUserText) menuUserText.textContent = `Olá, ${loggedInUser.name.split(' ')[0]}`; // Pega só o primeiro nome
        
        loginCard.classList.add('hidden');
        registerCard.classList.add('hidden');
        profileCard.classList.remove('hidden');
        
        document.getElementById('profile-name').textContent = loggedInUser.name;
        document.getElementById('profile-email').textContent = loggedInUser.email;
    } else {
        // Se NÃO estiver logado
        if (menuUserText) menuUserText.textContent = "Minha Conta";
        
        loginCard.classList.remove('hidden');
        registerCard.classList.add('hidden');
        profileCard.classList.add('hidden');
    }
}

// Finalização da compra
function checkout() {
    if (cart.length === 0) {
        alert("Seu carrinho está vazio! Adicione algum item antes de finalizar.");
        return;
    }
    alert("Pedido recebido! Seu pedido será preparado e entregue saindo do nosso endereço no Roça Grande em Colombo.");
    cart = [];
    updateCartUI();
    toggleCart();
}

function applyTheme(theme) {
    const body = document.body;
    const themeIcon = document.getElementById('theme-icon');

    if (!themeIcon) {
        return;
    }

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

window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    updateAuthUI(); // Atualiza a interface de login ao abrir o site
});
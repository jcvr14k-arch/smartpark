Módulo de suporte convertido para acesso pelo cargo `suporte`.

Rotas:
- /suporte/login -> página informativa que redireciona para o login principal
- /suporte/clientes -> exige usuário autenticado com role/cargo suporte
- /primeiro-acesso -> público

Requisitos:
- usuário precisa existir na coleção users
- campo role ou cargo deve ser `suporte`
- variáveis de backend Firestore continuam necessárias para acessar client_tokens pelo backend

Variáveis necessárias:
- NEXT_PUBLIC_FIREBASE_API_KEY
- FIREBASE_PROJECT_ID
- FIREBASE_SERVICE_ACCOUNT_EMAIL
- FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY

Como funciona:
- frontend usa Firebase Auth normal
- página de suporte verifica profile.role === 'suporte'
- APIs /api/support/* exigem Bearer token do Firebase e conferem no documento users/{uid} se role/cargo é suporte

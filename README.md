

# Gerador de Vouchers UniFi

Uma interface web simples e segura para gerar vouchers de acesso Wi-Fi (Hotspot) no UniFi Controller. Ideal para recepcionistas ou portarias, permitindo criar tickets de visitante sem dar acesso administrativo ao painel do UniFi.

## 🚀 Funcionalidades

- **Interface Simples:** Geração de voucher com um clique.
- **Tempos Personalizados:** Escolha entre predefinições (30min, 1h, etc.) ou defina um tempo exato em minutos, horas ou dias.
- **Segurança Aprimorada:** Configuração via Variáveis de Ambiente (`.env`). Sem armazenamento de senhas em disco e sem rotas de administração expostas.
- **Docker Ready:** Fácil de implantar com Docker Compose.

---

## ⚙️ Configuração (Variáveis de Ambiente)

O sistema agora é configurado exclusivamente via variáveis de ambiente para maior segurança. Você deve definir as seguintes variáveis no seu `docker-compose.yml` ou arquivo `.env`:

| Variável | Descrição | Exemplo |
| :--- | :--- | :--- |
| `UNIFI_CONTROLLER_URL` | URL do seu UniFi Controller (com https e porta). | `https://192.168.1.10:8443` |
| `UNIFI_USERNAME` | Usuário com permissão de Hotspot no UniFi. | `admin_voucher` |
| `UNIFI_PASSWORD` | Senha do usuário. | `MinhaSenhaSegura123` |
| `UNIFI_SITE_ID` | ID do Site (não é o nome amigável). Padrão: `default`. | `default` ou `8y9s7d6f` |

> **Dica sobre o Site ID:** Ao acessar seu controller via navegador, o ID do site aparece na URL. Ex: `https://.../manage/s/ce837s2/dashboard`. O ID é `ce837s2`. Se for o site padrão, é apenas `default`.

---

## 🐳 Instalação via Docker (Recomendado)

1. **Crie o arquivo `docker-compose.yml`:**

```yaml
services:
  unifi-portal:
    image: unifi-portal-app
    build: .
    container_name: unifi_portal
    ports:
      - "80:80"
    restart: unless-stopped
    environment:
      - UNIFI_CONTROLLER_URL=https://192.168.1.5:8443
      - UNIFI_SITE_ID=default
      - UNIFI_USERNAME=seu_usuario
      - UNIFI_PASSWORD=sua_senha
````

2.  **Inicie o serviço:**

<!-- end list -->

```bash
docker-compose up -d --build
```

3.  **Acesse:**
    Abra `http://localhost` (ou o IP do servidor) no navegador.

-----

## 💻 Instalação Manual (Node.js)

Se preferir rodar sem Docker para desenvolvimento:

1.  **Clone o repositório e instale as dependências:**

    ```bash
    git clone [https://github.com/seu-usuario/unifi-token-generator.git](https://github.com/seu-usuario/unifi-token-generator.git)
    cd unifi-token-generator
    npm install
    ```

2.  **Crie o arquivo de configuração:**
    Crie um arquivo chamado `.env` na raiz do projeto:

    ```env
    UNIFI_CONTROLLER_URL=https://192.168.1.5:8443
    UNIFI_SITE_ID=default
    UNIFI_USERNAME=seu_usuario
    UNIFI_PASSWORD=sua_senha
    ```

3.  **Execute o projeto:**

    ```bash
    node server.js
    ```

-----

## 🛡️ Notas de Segurança

  * **Certificados SSL:** O sistema está configurado para aceitar certificados autoassinados (`rejectUnauthorized: false`), o que é comum em instalações locais do UniFi.
  * **Usuário UniFi:** Recomenda-se criar um usuário no UniFi Controller **apenas** com permissões para gerenciar o Hotspot, em vez de usar o super-admin.
  * **Rede:** O servidor deste portal deve ter acesso de rede à porta do Controller (padrão 8443).

## 📄 Licença

Este projeto está licenciado sob a licença ISC/MIT. Sinta-se livre para modificar e usar.
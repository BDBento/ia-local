# Farol IA Local

Aplicativo desktop para conversar com modelos de IA executados no próprio computador. O projeto prioriza privacidade, funcionamento offline e adaptação a máquinas com diferentes quantidades de RAM, VRAM e núcleos de CPU.

## Estado atual

Esta é a primeira versão funcional do projeto. Ela inclui:

- chat conectado exclusivamente ao Ollama local;
- farol de privacidade sempre visível;
- modo offline estrito ativado por padrão;
- detecção de CPU, RAM e GPU;
- limites manuais de RAM, VRAM, threads e contexto;
- perfis Econômico, Equilibrado e Desempenho;
- recomendações de modelos de acordo com o orçamento definido;
- armazenamento local das configurações.

O farol representa a política de rede do aplicativo:

- **Verde — Offline protegido:** requisições externas do aplicativo estão bloqueadas e o chat usa apenas `127.0.0.1`.
- **Amarelo — Verificando:** o aplicativo está conferindo o serviço local.
- **Vermelho — Internet permitida:** o bloqueio estrito foi desativado. Isso não significa que dados já foram enviados, mas que a proteção não está ativa.

## Requisitos para desenvolvimento

- Windows 10 ou 11;
- Node.js 22 ou superior;
- Ollama para usar o chat e gerenciar modelos locais.

## Executar

```powershell
npm install
npm start
```

Para verificar a lógica sem abrir a interface:

```powershell
npm test
npm run check
```

## Privacidade

O chat só envia solicitações para `http://127.0.0.1:11434`, endereço padrão do Ollama no próprio computador. Modelos precisam ser instalados localmente antes de aparecerem no chat. A versão atual não fornece pesquisa na web nem ferramentas de rede ao modelo.

O modo offline estrito bloqueia conexões externas originadas pelo Electron. Como o Ollama é um processo separado, a garantia completa também depende de sua configuração. Uma versão futura poderá iniciar um serviço Ollama dedicado com recursos de nuvem desabilitados.

## Estrutura

```text
src/
  main/       Processo principal, hardware, configuração e Ollama
  renderer/   Interface do aplicativo
  shared/     Catálogo e lógica de recomendação
test/         Testes automatizados
```


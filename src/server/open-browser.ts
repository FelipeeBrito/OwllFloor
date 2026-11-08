import { spawn } from 'node:child_process';

export interface BrowserCommand {
  command: string;
  args: string[];
  /** Só no Windows: impede o Node de pôr aspas extras que o `start` não entende. */
  windowsVerbatimArguments?: boolean;
}

/**
 * Qual programa abre uma URL no navegador padrão de cada sistema.
 * Função pura para poder testar os três casos em qualquer máquina.
 */
export function browserCommand(platform: NodeJS.Platform, url: string): BrowserCommand {
  if (platform === 'win32') {
    // O "" é o título da janela: sem ele, o `start` trataria a URL como título.
    return { command: 'cmd', args: ['/c', 'start', '""', url], windowsVerbatimArguments: true };
  }
  if (platform === 'darwin') return { command: 'open', args: [url] };
  return { command: 'xdg-open', args: [url] };
}

/**
 * Abre a URL no navegador. Nunca derruba o servidor: se falhar, só avisa.
 * A URL é sempre montada pelo próprio servidor (http://127.0.0.1:PORTA), nunca vem do usuário.
 */
export function openBrowser(url: string): void {
  const { command, args, windowsVerbatimArguments } = browserCommand(process.platform, url);
  const warn = () => console.log(`Abra manualmente: ${url}`);
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments,
    });
    child.on('error', warn);
    // unref: o servidor pode encerrar sem esperar o navegador.
    child.unref();
  } catch {
    warn();
  }
}

# SSH usado para `claro_data_ai`

## Identidad activa para este repo
- Host alias: `github-claro-data-ai`
- Remote Git: `git@github-claro-data-ai:alejandrogutier/claro_data_ai.git`
- Archivo privado: `~/.ssh/id_ed25519_github_claro_data_ai`
- Archivo publico: `~/.ssh/id_ed25519_github_claro_data_ai.pub`
- Fingerprint: `SHA256:QFKjOlCGrKoofPc1QhbKPTsWMfgzM6Xq637TdT7ppAU`

## Clave publica (agregar en GitHub)
```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDJ0mPV0TjtZY5dJeTCROQRQGSoxjaaH2wIbXCTvuT98 claro_data_ai@agutie04-2026-02-16
```

## Entrada en `~/.ssh/config`
```sshconfig
Host github-claro-data-ai
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github_claro_data_ai
  IdentitiesOnly yes
```

## Estado actual
- La autenticacion aun falla hasta que la clave publica sea agregada en GitHub (Deploy Key con `Allow write access` o SSH key de un usuario con permisos).

## Verificacion
```bash
ssh -T git@github-claro-data-ai
```

## Push esperado cuando quede habilitado
```bash
git push -u origin main
git push -u origin codex/developer
```

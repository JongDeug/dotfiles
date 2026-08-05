# tmux + SSH + Vim clipboard

로컬 tmux 안에서 SSH로 원격 서버에 접속한 뒤, 원격 Vim의 yank 내용을 로컬
Windows/macOS 클립보드에 넣기 위한 설정이다. 핵심은 OSC 52 escape sequence다.

## 구조

```text
Windows Terminal / iTerm2 / WezTerm
  -> local tmux
    -> ssh remote-host
      -> remote vim
```

원격 서버에 tmux가 없어도 된다. 원격 Vim이 OSC 52를 출력하고, 로컬 tmux가 그
escape sequence를 바깥 터미널로 전달하면 OS 클립보드에 들어간다.

## 로컬 tmux 설정

`~/.tmux.conf`에는 아래 설정이 필요하다.

```tmux
set -as terminal-features ',*:clipboard'
set -g allow-passthrough on
set -g set-clipboard on

bind -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "tmux load-buffer -w -"
bind -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "tmux load-buffer -w -"
bind -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "tmux load-buffer -w -"
bind -n MouseDrag1Pane copy-mode -M
bind -n MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "tmux load-buffer -w -"
```

이 repo에서는 [`.tmux.conf`](./.tmux.conf)에 이미 들어 있다.

적용:

```sh
tmux source-file ~/.tmux.conf
```

확인:

```sh
tmux show-options -g set-clipboard
tmux show-options -g allow-passthrough
tmux info | rg 'Ms:'
```

`set-clipboard on`, `allow-passthrough on`, `Ms: ... \033]52...`가 보이면 tmux
쪽 기본 경로는 열린 상태다.

## 원격 SSH 경로 테스트

SSH로 원격 서버에 들어간 뒤 아래를 실행한다.

```sh
printf '\033]52;c;%s\a' "$(printf 'REMOTE_OSC52_TEST' | base64 -w0)"
```

로컬 OS에서 붙여넣기 했을 때 `REMOTE_OSC52_TEST`가 나오면 성공이다.

raw OSC52가 안 되면 tmux passthrough 형태도 테스트한다.

```sh
printf '\033Ptmux;\033\033]52;c;%s\a\033\\' "$(printf 'REMOTE_OSC52_TEST' | base64 -w0)"
```

## 원격 Vim 요구사항

원격 `vi`가 실제로는 Vim이어야 하고, `+eval`이 필요하다.

```sh
vi --version | head -1
vi --version | grep eval
```

`-eval`이면 `function`, `autocmd`, `TextYankPost`를 쓸 수 없다. 이 경우
`vim-enhanced` 같은 full Vim을 설치해야 한다.

RHEL/CentOS 계열:

```sh
sudo dnf install vim-enhanced
```

또는:

```sh
sudo yum install vim-enhanced
```

## 원격 ~/.vimrc

원격 서버의 `~/.vimrc`에 아래를 넣는다.

```vim
function! Osc52Copy(text) abort
  if empty(a:text)
    return
  endif

  let l:encoded = system('base64 -w0', a:text)
  if v:shell_error
    echoerr 'base64 failed'
    return
  endif

  let l:encoded = substitute(l:encoded, '\n', '', 'g')
  call system("printf '\\033]52;c;" . l:encoded . "\\a' > /dev/tty")
endfunction

augroup osc52_yank
  autocmd!
  autocmd TextYankPost * if v:event.operator ==# 'y' | call Osc52Copy(join(v:event.regcontents, "\n") . (v:event.regtype ==# 'V' ? "\n" : "")) | endif
augroup END
```

큰 블록을 Vim 안에 직접 붙여넣을 때 들여쓰기가 망가지면 붙여넣기 전에
`:set paste`, 붙여넣은 뒤 `:set nopaste`를 쓴다. 더 안전하게는 shell에서
heredoc으로 작성한다.

```sh
cat > ~/.vimrc <<'EOF'
function! Osc52Copy(text) abort
  if empty(a:text)
    return
  endif

  let l:encoded = system('base64 -w0', a:text)
  if v:shell_error
    echoerr 'base64 failed'
    return
  endif

  let l:encoded = substitute(l:encoded, '\n', '', 'g')
  call system("printf '\\033]52;c;" . l:encoded . "\\a' > /dev/tty")
endfunction

augroup osc52_yank
  autocmd!
  autocmd TextYankPost * if v:event.operator ==# 'y' | call Osc52Copy(join(v:event.regcontents, "\n") . (v:event.regtype ==# 'V' ? "\n" : "")) | endif
augroup END
EOF
```

## Vim 안에서 검증

Vim 안에서 실행한다. shell에서 `source ~/.vimrc`를 실행하면 안 된다.

```vim
:source ~/.vimrc
:echo exists('##TextYankPost')
:echo exists('*Osc52Copy')
:autocmd osc52_yank
:call Osc52Copy("VIM_OSC52_TEST")
```

기대값:

```text
exists('##TextYankPost') => 1
exists('*Osc52Copy') => 1
```

`VIM_OSC52_TEST`가 로컬 OS 클립보드에 붙여넣기 되면 함수 경로가 정상이다.
그 다음 원격 Vim에서 `yy` 또는 visual select 후 `y`를 테스트한다.

## 문제별 판정

`REMOTE_OSC52_TEST`가 붙여넣기 된다:
원격 shell -> ssh -> local tmux -> outer terminal 경로는 정상이다. Vim 설정만 보면 된다.

`REMOTE_OSC52_TEST`가 안 된다:
로컬 터미널이 OSC 52 clipboard write를 막거나, tmux passthrough/clipboard 설정이
적용되지 않은 상태다.

`:autocmd osc52_yank`가 `No such group or event`라고 나온다:
`~/.vimrc`가 로드되지 않았거나 로드 중 에러가 난 것이다. Vim 안에서
`:source ~/.vimrc`를 실행해 에러를 확인한다.

`E319: Sorry, the command is not available in this version`가 나온다:
원격 Vim이 `-eval` 빌드다. full Vim을 설치해야 한다.


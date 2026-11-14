# Capri <- your terminal (bash or zsh). She reacts to a command that failed, one that took a while,
# a git push or commit, tests that pass. Source it from ~/.bashrc or ~/.zshrc:
#
#   source /path/to/capri-desktop/hooks/capri-shell.sh
#
# (npm run shell:install adds that line for you; npm run shell:uninstall takes it out.)
#
# Rule #1, like her Claude Code hook: never get in your way. It sends in the background, gives up
# after a second or two, prints nothing, and keeps your exit code. Only what's worth a word is sent:
# failures (not Ctrl+C, not grep finding nothing), commands of CAPRI_SHELL_MIN seconds or more, git
# push / commit, tests. It goes to Capri on 127.0.0.1 only. A command that looks like it holds a
# secret (token, password, key...) is sent as its program's name alone.
# In WSL with the default NAT networking, 127.0.0.1 isn't Windows': Windows' own curl.exe takes it.

[ -n "${CAPRI_SHELL_LOADED-}" ] && return 0
case $- in *i*) ;; *) return 0 ;; esac # interactive shells only
CAPRI_SHELL_LOADED=1
: "${CAPRI_PORT:=47823}"
: "${CAPRI_SHELL_MIN:=15}" # seconds

# programs that are interactive, or whose non-zero exit is an answer rather than an error
_capri_quiet='^(grep|egrep|fgrep|rg|ag|ack|test|\[|\[\[|diff|cmp|false|true|which|type|command|hash|less|more|man|vi|vim|nvim|nano|emacs|micro|ssh|mosh|top|htop|btop|watch|tail|journalctl|claude|codex|gemini|ollama|python3?|node|ipython|irb|psql|mysql|sqlite3|tmux|screen|exit|cd|pushd|popd|source|\.|history|clear|reset|sleep|read|wait|fg|bg|jobs|kill|ping|git (diff|log|show|status|grep|stash list|branch|blame))( |$)'
_capri_secret='([Tt][Oo][Kk][Ee][Nn]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Pp][Aa][Ss][Ss]|[Kk][Ee][Yy]=|[Aa]uthorization|[Bb]earer|-p[^ ]| -u [^ ]+:)'

_capri_json() { # a JSON string: backslashes, quotes, tabs, newlines, other control characters out
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\t'/ }
  s=${s//$'\r'/}
  s=${s//$'\n'/ }
  s=$(printf '%s' "$s" | LC_ALL=C tr -d '\000-\037')
  printf '"%s"' "$s"
}

_capri_post() { # $1: the JSON body
  curl -s -m 1 -o /dev/null -H 'content-type: application/json' --data-binary "$1" "http://127.0.0.1:${CAPRI_PORT}/event" 2>/dev/null && return
  local win=/mnt/c/Windows/System32/curl.exe
  [ -x "$win" ] && printf '%s' "$1" | "$win" -s -m 2 -o NUL -H 'content-type: application/json' --data-binary @- "http://127.0.0.1:${CAPRI_PORT}/event" >/dev/null 2>&1
}

_capri_now_ms() {
  if [ -n "${EPOCHREALTIME-}" ]; then
    local t=${EPOCHREALTIME/[.,]/}
    printf '%s' "${t:0:${#t}-3}"
  else
    printf '%s000' "$(date +%s)"
  fi
}

_capri_report() { # $1: command, $2: exit code, $3: start in ms
  local cmd=$1 code=$2 start=$3
  [ -z "$cmd" ] || [ -z "$start" ] && return
  cmd=${cmd#"${cmd%%[![:space:]]*}"} # leading spaces
  local first=${cmd%%[[:space:]]*}
  [[ $cmd =~ $_capri_quiet ]] && return
  local ms=$(( $(_capri_now_ms) - start ))
  # Ctrl+C, Ctrl+Z: you stopped it yourself
  { [ "$code" = 130 ] || [ "$code" = 148 ] || [ "$code" = 146 ]; } && return
  if [ "$code" = 0 ] && [ "$ms" -lt $(( CAPRI_SHELL_MIN * 1000 )) ]; then
    [[ $cmd =~ ^git\ (push|commit)( |$) ]] \
      || [[ $cmd =~ (^|[[:space:]])(npm|pnpm|yarn|bun)\ (run\ )?test|(jest|vitest|mocha|pytest|phpunit|rspec)( |$)|(cargo|go|dotnet|mvn|gradle)\ test|node\ --test ]] \
      || return
  fi
  # the program's name alone; an assignment (TOKEN=... cmd) not even that
  if [[ $cmd =~ $_capri_secret ]]; then
    case $first in *=*|\$*) cmd='(command hidden)' ;; *) cmd=$first ;; esac
  fi
  [ "${#cmd}" -gt 200 ] && cmd="${cmd:0:200}…"
  local body
  body="{\"hook_event_name\":\"ShellCommand\",\"command\":$(_capri_json "$cmd"),\"exit_code\":$code,\"duration_ms\":$ms,\"cwd\":$(_capri_json "$PWD")}"
  ( _capri_post "$body" & ) >/dev/null 2>&1 # twice forked: no job notice in your terminal
}

if [ -n "${ZSH_VERSION-}" ]; then
  _capri_preexec() { _capri_cmd=$1; _capri_start=$(_capri_now_ms); }
  _capri_precmd() {
    local code=$?
    [ -n "${_capri_start-}" ] && _capri_report "$_capri_cmd" "$code" "$_capri_start"
    _capri_cmd=; _capri_start=
    return $code
  }
  autoload -Uz add-zsh-hook
  add-zsh-hook preexec _capri_preexec
  add-zsh-hook precmd _capri_precmd
elif [ -n "${BASH_VERSION-}" ]; then
  # bash has no preexec: the DEBUG trap fires before each command; only the first one after a
  # prompt counts (the rest of that line, and PROMPT_COMMAND's own, are left alone)
  _capri_at_prompt=1
  _capri_preexec() {
    [ "${_capri_at_prompt-}" = 1 ] || return 0
    [ -n "${COMP_LINE-}" ] && return 0 # tab completion
    _capri_at_prompt=0
    # the whole line from history; but a line typed with a space first isn't in it (HISTCONTROL),
    # and then history's last is an older one: BASH_COMMAND (the line's first command) instead
    _capri_cmd=$(HISTTIMEFORMAT= builtin history 1 2>/dev/null | sed -E 's/^ *[0-9]+\*? *//')
    [ "${_capri_cmd%%[[:space:]]*}" = "${BASH_COMMAND%%[[:space:]]*}" ] || _capri_cmd=$BASH_COMMAND
    _capri_start=$(_capri_now_ms)
    return 0
  }
  _capri_precmd() {
    local code=$?
    if [ -n "${_capri_start-}" ]; then
      _capri_report "$_capri_cmd" "$code" "$_capri_start"
    fi
    _capri_cmd=; _capri_start=
    _capri_at_prompt=1
    return $code
  }
  # whatever DEBUG trap was there (VS Code's shell integration, bash-preexec...) still runs
  _capri_prev_debug=$(trap -p DEBUG | sed -E "s/^trap -- '(.*)' DEBUG$/\\1/")
  if [ -n "$_capri_prev_debug" ]; then
    trap '_capri_preexec; eval "$_capri_prev_debug"' DEBUG
  else
    trap '_capri_preexec' DEBUG
  fi
  # first, so it reads the command's own exit code
  if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
    PROMPT_COMMAND=(_capri_precmd "${PROMPT_COMMAND[@]}")
  else
    PROMPT_COMMAND="_capri_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
  fi
fi

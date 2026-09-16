#Requires AutoHotkey v2.0
#SingleInstance Force

; ---------------------------------------------------------------------------
; Ctrl+Alt+Space -> Tick quick capture.
;
; Windows hands a hotkey to whichever app registered it first and will not let
; another app take it, so Tick alone cannot claim Ctrl+Alt+Space while Claude
; holds it. A low-level keyboard hook is the exception: it sees the keystroke
; before Windows dispatches hotkeys at all.
;
; The "$" prefix forces AutoHotkey to use that hook. We swallow the key and
; forward to Ctrl+Alt+Q, which Tick always holds as a fixed second door.
; (It used to be Ctrl+Alt+C; that key now saves the whole screen.)
; ---------------------------------------------------------------------------

$^!Space:: {
    Send("^!q")
}

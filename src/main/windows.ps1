# Watches the top-level windows so Capri can sit on them.
# Prints one JSON line whenever something changes: the foreground window and the visible
# windows in z-order (front first), as physical-pixel frame bounds. No contents, and no titles:
# the title of the window in front is only checked against a short list of AI names (ChatGPT,
# Gemini...) for her jealousy, and all that goes out is which of them matched ("ai"), whether
# it's their own page in a browser ("pages") and whether it's a page to download one ("dl").
# Reads "close <hwnd> <key> <n>" lines on its input: she closes that page (see Close).
#
#   powershell -File windows.ps1 <capri hwnd> <capri pid>

param([long]$Self = 0, [int]$ParentPid = 0)
$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies System.Management -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

public static class CapriWindows {
  delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd, int index);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT value, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool ClipCursor(ref RECT r);
  [DllImport("user32.dll", EntryPoint = "ClipCursor")] static extern bool FreeCursor(IntPtr none);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);

  const int GWL_EXSTYLE = -20;
  const int WS_EX_TOOLWINDOW = 0x80;
  const int WS_EX_NOACTIVATE = 0x08000000;
  const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
  const int DWMWA_CLOAKED = 14;

  // Other AIs: a key, what gives them away in the title of the window in front, the name of
  // their own app's program if they have one, and the name their own site gives its pages.
  static readonly string[][] AIS = {
    new[] { "chatgpt", @"\bChatGPT\b", "chatgpt", "ChatGPT" },
    new[] { "claude", @"\bClaude\b", "claude", "Claude" },
    new[] { "codex", @"\bCodex\b", "codex", "Codex" },
    new[] { "gemini", @"\bGemini\b", "", "(?:Google )?Gemini" },
    new[] { "copilot", @"\bCopilot\b", "copilot", "(?:Microsoft )?Copilot" },
    new[] { "perplexity", @"\bPerplexity\b", "perplexity", "Perplexity" },
    new[] { "deepseek", @"\bDeepSeek\b", "", "DeepSeek" },
    new[] { "grok", @"\bGrok\b", "", "Grok" },
    new[] { "lechat", @"\bLe Chat\b|\bMistral AI\b", "", "Le Chat|Mistral AI" },
    new[] { "characterai", @"character\.ai", "", @"character\.ai" },
    new[] { "metaai", @"\bMeta AI\b", "", "Meta AI" },
  };

  // Browsers, by their program's name: there, one of them is a page in a tab, closed with Ctrl+W.
  static readonly HashSet<string> BROWSERS = new HashSet<string> {
    "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "arc", "chromium", "librewolf", "waterfox", "floorp", "zen", "thorium",
  };

  // A browser's title is its tab's, then its own: "ChatGPT - Google Chrome", "Chat - Claude -
  // Personal - Microsoft Edge", "Gemini <em dash> Mozilla Firefox"; Edge adds "and 3 more pages" in
  // your language ("et 3", "e mais 3", "i eshche 3"). Their own pages have their name
  // as a whole part of it, not inside a sentence ("ChatGPT is down - YouTube" is no page of theirs).
  const string SEP = @"(?: [-|:\u2013\u2014] |: |(?: \p{L}{1,5}){1,2} \d+ (?=.*Edge$))";
  public static bool Site(string[] ai, string title) {
    return Regex.IsMatch(title, @"(?:^|" + SEP + @")(?:" + ai[3] + @")(?:" + SEP + @"|$)", RegexOptions.IgnoreCase);
  }

  // A page to download or install something, in her languages (download, install, setup,
  // telecharger, descargar / descargalo, baixar / baixe, transferir / transfira, and the Russian
  // skach-, zagruz-, ustanov-) and in German and Italian (herunterladen, scarica).
  static readonly Regex DL = new Regex(@"download|t.l.charg|desc.rg|baix(?:ar|e|a|ando)|transf(?:erir|ira|ere)|herunterlad|scaric|install|setup|\u0441\u043a\u0430\u0447|\u0437\u0430\u0433\u0440\u0443\u0437|\u0443\u0441\u0442\u0430\u043d\u043e\u0432", RegexOptions.IgnoreCase);

  // That AI's own page, or a page to download it: what she closes.
  public static bool Closable(string[] ai, string title) {
    return Site(ai, title) || (Regex.IsMatch(title, ai[1], RegexOptions.IgnoreCase) && DL.IsMatch(title));
  }

  static IntPtr procOf = IntPtr.Zero;
  static string proc = "";
  static string game = "";
  // Comment on what I do (her menu, off by default): only then does the window in front's program
  // and title leave this script, for her to say something about what you're up to.
  static volatile bool titles = false;

  // A game: its program sits in a launcher's library (Steam, Epic, Riot, Xbox, GOG). The game is the
  // name of its folder there (the launchers themselves aren't games).
  static readonly Regex GAME = new Regex(@"\\(?:steamapps\\common|Epic Games|Riot Games|XboxGames|GOG Galaxy\\Games)\\([^\\]+)\\", RegexOptions.IgnoreCase);
  static readonly Regex NOT_GAME = new Regex(@"launcher|client|redistributable|steamworks", RegexOptions.IgnoreCase);

  static string ProcName(IntPtr hwnd) {
    uint pid;
    GetWindowThreadProcessId(hwnd, out pid);
    try { return System.Diagnostics.Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { return ""; }
  }

  // The program behind the window in front, when it changes: its name, and the game it is, if one.
  static void Program(IntPtr fg) {
    if (fg == procOf) return;
    procOf = fg;
    proc = ProcName(fg);
    game = "";
    uint pid;
    GetWindowThreadProcessId(fg, out pid);
    IntPtr h = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
    if (h == IntPtr.Zero) return;
    var path = new StringBuilder(1024);
    int size = path.Capacity;
    if (QueryFullProcessImageName(h, 0, path, ref size)) {
      var m = GAME.Match(path.ToString());
      if (m.Success && !NOT_GAME.IsMatch(m.Groups[1].Value)) game = m.Groups[1].Value;
    }
    CloseHandle(h);
  }

  static string Json(string s) {
    return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
  }

  // The window in front, for "Comment on what I do": its program and its title, nothing else.
  static string App(IntPtr fg) {
    var title = new StringBuilder(512);
    GetWindowText(fg, title, 512);
    var t = Regex.Replace(title.ToString(), @"[\x00-\x1f]", " ");
    if (t.Length > 160) t = t.Substring(0, 160);
    return "{\"proc\":" + Json(proc) + ",\"title\":" + Json(t) + "}";
  }

  // A call: the program using the microphone or the camera right now, as Windows itself keeps it
  // (Settings > Privacy > Microphone, "currently in use"). Teams, Zoom, Meet in a browser, Discord,
  // WhatsApp... She goes quiet then. Looked at every couple of seconds; only the program's name.
  static string call = "null";
  static DateTime callAt = DateTime.MinValue;
  static string Call() {
    if ((DateTime.Now - callAt).TotalMilliseconds < 2000) return call;
    callAt = DateTime.Now;
    string mic = InUse("microphone"), cam = InUse("webcam");
    call = mic == "" && cam == "" ? "null" : "{\"mic\":" + Json(mic) + ",\"cam\":" + Json(cam) + "}";
    return call;
  }
  static string InUse(string what) {
    try {
      using (var root = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\" + what)) {
        if (root == null) return "";
        string hit = Scan(root);
        if (hit != "") return hit;
        using (var np = root.OpenSubKey("NonPackaged")) { return np == null ? "" : Scan(np); }
      }
    } catch { return ""; }
  }
  static string Scan(Microsoft.Win32.RegistryKey key) {
    foreach (var name in key.GetSubKeyNames()) {
      if (name == "NonPackaged") continue;
      using (var k = key.OpenSubKey(name)) {
        if (k == null) continue;
        object start = k.GetValue("LastUsedTimeStart"), stop = k.GetValue("LastUsedTimeStop");
        if (!(start is long) || !(stop is long) || (long)start == 0 || (long)stop != 0) continue;
        // "MicrosoftTeams_8wekyb3d8bbwe" or "C:#Program Files#Discord#Discord.exe": the program's name
        string n = name.Contains("#") ? name.Substring(name.LastIndexOf('#') + 1) : name.Split('_')[0];
        n = Regex.Replace(n, @"\.exe$", "", RegexOptions.IgnoreCase).ToLowerInvariant();
        if (n == "capri") continue;
        return n.Length > 40 ? n.Substring(0, 40) : n;
      }
    }
    return "";
  }

  // USB sticks (and SD cards) plugged in, by drive letter, looked at every couple of seconds.
  static string usb = "[]";
  static DateTime usbAt = DateTime.MinValue;
  static string Usb() {
    if ((DateTime.Now - usbAt).TotalMilliseconds < 2000) return usb;
    usbAt = DateTime.Now;
    var letters = new StringBuilder();
    try {
      foreach (var d in System.IO.DriveInfo.GetDrives()) {
        if (d.DriveType != System.IO.DriveType.Removable || !d.IsReady) continue;
        if (letters.Length > 0) letters.Append(',');
        letters.Append(Json(d.Name.Substring(0, 1)));
      }
    } catch {}
    usb = "[" + letters.ToString() + "]";
    return usb;
  }

  // Which of them the window in front is, as a JSON list of keys; in a browser, then "pages": the
  // ones whose own page it is, and "dl": whether it's a page to download one of them.
  static string Ai(IntPtr fg) {
    var title = new StringBuilder(512);
    GetWindowText(fg, title, 512);
    Program(fg);
    string t = title.ToString();
    bool browser = BROWSERS.Contains(proc);
    var keys = new StringBuilder();
    var pages = new StringBuilder();
    foreach (var ai in AIS) {
      if (!Regex.IsMatch(t, ai[1], RegexOptions.IgnoreCase) && (ai[2] == "" || proc != ai[2])) continue;
      if (keys.Length > 0) keys.Append(',');
      keys.Append('"').Append(ai[0]).Append('"');
      if (!browser || !Site(ai, t)) continue;
      if (pages.Length > 0) pages.Append(',');
      pages.Append('"').Append(ai[0]).Append('"');
    }
    bool dl = browser && keys.Length > 0 && DL.IsMatch(t);
    return "[" + keys.ToString() + "],\"pages\":[" + pages.ToString() + "],\"dl\":" + (dl ? "true" : "false");
  }

  // She closes that AI's page in window `id` with the browser's own shortcut for its tab (Ctrl+W),
  // if it still is that page, in that window, in front, in a browser, and no Shift, Alt or Windows
  // key is held (Ctrl+Shift+W would close the whole window). "" once done, else why not.
  public static string Close(long id, string key) {
    IntPtr fg = GetForegroundWindow();
    if (fg.ToInt64() != id) return "front";
    if (!BROWSERS.Contains(ProcName(fg))) return "browser";
    var title = new StringBuilder(512);
    GetWindowText(fg, title, 512);
    string[] ai = Array.Find(AIS, a => a[0] == key);
    if (ai == null || !Closable(ai, title.ToString())) return "page";
    foreach (int held in new[] { 0x10, 0x12, 0x5B, 0x5C }) {
      if ((GetAsyncKeyState(held) & 0x8000) != 0) return "keys";
    }
    keybd_event(0x11, 0, 0, UIntPtr.Zero); // Ctrl
    keybd_event(0x57, 0, 0, UIntPtr.Zero); // W
    keybd_event(0x57, 0, 2, UIntPtr.Zero); // KEYEVENTF_KEYUP
    keybd_event(0x11, 0, 2, UIntPtr.Zero);
    return "";
  }

  // ---- Feel my keyboard and mouse (her menu, off by default) ----
  // Her senses: how you type and click, never what. Keys are only counted (and Backspace and Enter
  // told apart, for her to see you erase or send); which key, never. Clicks come with where they
  // landed on the screen, for her to react when you click near her or hammer one spot. A line every
  // second and a half with the counts, only while this is on.
  static volatile bool sensing = false;
  static void Sense() {
    var down = new bool[256];
    int keys = 0, back = 0, enter = 0;
    var clicks = new StringBuilder();
    int nclicks = 0;
    var last = DateTime.Now;
    while (true) {
      System.Threading.Thread.Sleep(20);
      if (!sensing) { keys = back = enter = nclicks = 0; clicks.Clear(); continue; }
      for (int k = 1; k < 256; k++) {
        if (k == 0x10 || k == 0x11 || k == 0x12) continue; // the generic Shift / Ctrl / Alt (their left and right ones count)
        bool now = (GetAsyncKeyState(k) & 0x8000) != 0;
        if (now && !down[k]) {
          if (k == 1 || k == 2 || k == 4) {
            POINT p;
            if (nclicks < 12 && GetCursorPos(out p)) {
              if (clicks.Length > 0) clicks.Append(',');
              clicks.Append("[").Append(p.X).Append(',').Append(p.Y).Append(',').Append(k == 1 ? 0 : k == 2 ? 2 : 1).Append(']');
              nclicks++;
            }
          } else if (k > 6) {
            keys++;
            if (k == 0x08) back++;
            else if (k == 0x0D) enter++;
          }
        }
        down[k] = now;
      }
      if ((DateTime.Now - last).TotalMilliseconds >= 1500) {
        last = DateTime.Now;
        if (keys > 0 || nclicks > 0) {
          Console.Out.WriteLine("{\"sense\":{\"keys\":" + keys + ",\"back\":" + back + ",\"enter\":" + enter + ",\"clicks\":[" + clicks.ToString() + "]}}");
          Console.Out.Flush();
        }
        keys = back = enter = nclicks = 0;
        clicks.Clear();
      }
    }
  }

  // ---- Her pranks (her menu > Mischief): harmless, short, and everything put back as it was ----
  static int playing = 0; // one at a time

  // any key held down right now (typing, a shortcut): then she keeps her hands off
  static bool KeysDown() {
    for (int k = 8; k < 256; k++) if ((GetAsyncKeyState(k) & 0x8000) != 0) return true;
    return false;
  }

  // She tugs your pointer toward her hand: at most 140 px of the way, over `ms`.
  static void Tug(int x, int y, int ms) {
    POINT p;
    if (!GetCursorPos(out p)) return;
    double dx = x - p.X, dy = y - p.Y, d = Math.Sqrt(dx * dx + dy * dy);
    if (d < 4) return;
    double k = Math.Min(1.0, 140.0 / d);
    int steps = Math.Max(4, ms / 16);
    for (int i = 1; i <= steps; i++) {
      double t = (double)i / steps, e = 1 - (1 - t) * (1 - t); // eased
      SetCursorPos((int)(p.X + dx * k * e), (int)(p.Y + dy * k * e));
      System.Threading.Thread.Sleep(16);
    }
  }

  // She stomps on the window she sits on: it shakes a few px, then is back exactly where it was.
  static void Shake(long id, int ms) {
    IntPtr h = new IntPtr(id);
    RECT r;
    if (!IsWindowVisible(h) || IsIconic(h) || IsZoomed(h) || !GetWindowRect(h, out r)) return;
    const uint FLAGS = 0x0001 | 0x0004 | 0x0010; // SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE
    int[] dx = { 7, -6, 5, -4, 3, -2, 1, 0 };
    int[] dy = { -3, 2, -2, 1, -1, 1, 0, 0 };
    int wait = Math.Max(12, ms / dx.Length);
    try {
      for (int i = 0; i < dx.Length; i++) {
        SetWindowPos(h, IntPtr.Zero, r.Left + dx[i], r.Top + dy[i], 0, 0, FLAGS);
        System.Threading.Thread.Sleep(wait);
      }
    } finally {
      SetWindowPos(h, IntPtr.Zero, r.Left, r.Top, 0, 0, FLAGS);
    }
  }

  // She blinks your keyboard's lights: Caps Lock on and off, twice, so it ends as it was.
  static void Blink() {
    for (int i = 0; i < 4; i++) {
      if (KeysDown() && i % 2 == 0) return; // you started typing: an even count, Caps Lock as it was
      keybd_event(0x14, 0x3A, 0x0, UIntPtr.Zero); // Caps Lock down
      keybd_event(0x14, 0x3A, 0x2, UIntPtr.Zero); // and up
      System.Threading.Thread.Sleep(170);
    }
  }

  // Cursor jail: your pointer kept in a small box around her for a moment, then free again.
  static void Jail(int x, int y, int ms) {
    var r = new RECT { Left = x - 70, Top = y - 70, Right = x + 70, Bottom = y + 70 };
    try {
      SetCursorPos(x, y);
      ClipCursor(ref r);
      System.Threading.Thread.Sleep(ms);
    } finally {
      FreeCursor(IntPtr.Zero);
    }
  }

  // She drags the window she sits on a little way, and puts it back.
  static void Slide(long id, int dx) {
    IntPtr h = new IntPtr(id);
    RECT r;
    if (!IsWindowVisible(h) || IsIconic(h) || IsZoomed(h) || !GetWindowRect(h, out r)) return;
    const uint FLAGS = 0x0001 | 0x0004 | 0x0010;
    dx = Math.Max(-120, Math.Min(120, dx));
    try {
      for (int i = 1; i <= 12; i++) { SetWindowPos(h, IntPtr.Zero, r.Left + dx * i / 12, r.Top, 0, 0, FLAGS); System.Threading.Thread.Sleep(30); }
      System.Threading.Thread.Sleep(1200);
      for (int i = 11; i >= 0; i--) { SetWindowPos(h, IntPtr.Zero, r.Left + dx * i / 12, r.Top, 0, 0, FLAGS); System.Threading.Thread.Sleep(25); }
    } finally {
      SetWindowPos(h, IntPtr.Zero, r.Left, r.Top, 0, 0, FLAGS);
    }
  }

  static void Prank(string[] ask) {
    if (System.Threading.Interlocked.Exchange(ref playing, 1) == 1) return;
    var worker = new System.Threading.Thread(() => {
      try {
        if (KeysDown()) return;
        int a, b, c;
        long id;
        if (ask[0] == "tug" && ask.Length == 4 && int.TryParse(ask[1], out a) && int.TryParse(ask[2], out b) && int.TryParse(ask[3], out c)) Tug(a, b, Math.Min(c, 600));
        else if (ask[0] == "shake" && ask.Length == 3 && long.TryParse(ask[1], out id) && int.TryParse(ask[2], out c)) Shake(id, Math.Min(c, 700));
        else if (ask[0] == "blink") Blink();
        else if (ask[0] == "jail" && ask.Length == 4 && int.TryParse(ask[1], out a) && int.TryParse(ask[2], out b) && int.TryParse(ask[3], out c)) Jail(a, b, Math.Min(c, 2500));
        else if (ask[0] == "slide" && ask.Length == 3 && long.TryParse(ask[1], out id) && int.TryParse(ask[2], out c)) Slide(id, c);
      } catch {
      } finally {
        System.Threading.Interlocked.Exchange(ref playing, 0);
      }
    });
    worker.IsBackground = true;
    worker.Start();
  }

  // What Capri asks, one line at a time on our input, each answered with a line of its own.
  public static void Listen() {
    var reader = new System.Threading.Thread(() => {
      string line;
      while ((line = Console.In.ReadLine()) != null) {
        var ask = line.Split(' ');
        if (ask.Length == 2 && ask[0] == "activity") { titles = ask[1] == "1"; continue; }
        if (ask.Length == 2 && ask[0] == "sense") { sensing = ask[1] == "1"; continue; }
        if (ask[0] == "tug" || ask[0] == "shake" || ask[0] == "blink" || ask[0] == "jail" || ask[0] == "slide") { Prank(ask); continue; }
        if (ask.Length != 4 || ask[0] != "close") continue;
        string why;
        long id;
        int n;
        if (!long.TryParse(ask[1], out id) || !int.TryParse(ask[3], out n)) continue;
        try { why = Close(id, ask[2]); } catch { why = "error"; }
        Console.Out.WriteLine("{\"closed\":" + n + ",\"why\":" + Json(why) + "}");
        Console.Out.Flush();
      }
    });
    reader.IsBackground = true;
    reader.Start();
    var senses = new System.Threading.Thread(Sense);
    senses.IsBackground = true;
    senses.Start();
  }

  public static void Init() {
    SetProcessDpiAwarenessContext(new IntPtr(-4)); // per-monitor v2: real pixels everywhere
    try { WatchDevices(); } catch {}
  }

  // Devices plugged in or out (a phone, a controller, a headset...). Windows says something
  // changed; we list the devices again and see what's new or gone.
  static Dictionary<string, string[]> devices;
  static int plugs = 0;
  static string plug = "null";
  static readonly object gate = new object();

  static Dictionary<string, string[]> Devices() {
    var all = new Dictionary<string, string[]>();
    using (var q = new ManagementObjectSearcher("SELECT DeviceID, Name, PNPClass FROM Win32_PnPEntity")) {
      foreach (ManagementBaseObject d in q.Get()) {
        var id = d["DeviceID"] as string;
        if (id != null) all[id] = new[] { (d["Name"] as string) ?? "", (d["PNPClass"] as string) ?? "" };
      }
    }
    return all;
  }

  static void WatchDevices() {
    devices = Devices();
    var watcher = new ManagementEventWatcher(new WqlEventQuery("SELECT * FROM Win32_DeviceChangeEvent WHERE EventType = 2 OR EventType = 3"));
    watcher.EventArrived += (s, e) => {
      try { Changed(); } catch {} // never take the whole helper down over a device
    };
    watcher.Start();
  }

  static void Changed() {
    System.Threading.Thread.Sleep(1200); // a phone shows up as several devices, one after the other
    lock (gate) {
      var now = Devices();
      var added = new List<string[]>();
      var removed = new List<string[]>();
      foreach (var d in now) if (!devices.ContainsKey(d.Key)) added.Add(d.Value);
      foreach (var d in devices) if (!now.ContainsKey(d.Key)) removed.Add(d.Value);
      devices = now;
      bool plugged = added.Count > 0;
      var best = Best(plugged ? added : removed);
      if (best == null) return;
      plugs++;
      plug = "{\"n\":" + plugs + ",\"in\":" + (plugged ? "true" : "false") + ",\"name\":" + Json(best[0]) + ",\"class\":" + Json(best[1]) + "}";
    }
  }

  // The device that says the most about what was plugged: "Galaxy S21" rather than "USB Composite Device".
  static readonly Regex VAGUE = new Regex(@"composite|hub|concentrateur|input device|hid|mass storage|stockage|g.n.ri|virtu|num.rat|interface|host|h.te|bus|port|endpoint|service|profil|protocol|p.riph.rique|dispositivo", RegexOptions.IgnoreCase); // ASCII only: PowerShell reads this file as ANSI
  public static string[] Best(List<string[]> list) {
    string[] best = null;
    int top = int.MinValue;
    foreach (var d in list) {
      if (d[0] == "") continue;
      int score = d[1] == "WPD" ? 6 : d[1] == "AudioEndpoint" ? 5 : d[1] == "Camera" || d[1] == "Image" ? 4 : d[1] == "HIDClass" || d[1] == "Keyboard" || d[1] == "Mouse" ? 3 : d[1] == "Bluetooth" ? 2 : 1;
      if (VAGUE.IsMatch(d[0])) score -= 4;
      if (score > top) { top = score; best = d; }
    }
    return best;
  }

  public static string Snapshot(long self) {
    var sb = new StringBuilder();
    IntPtr fg = GetForegroundWindow();
    var fgClass = new StringBuilder(64);
    GetClassName(fg, fgClass, 64);
    // the taskbar clicked: it comes up over her (Windows has no levels among windows on top)
    bool taskbar = fgClass.ToString() == "Shell_TrayWnd" || fgClass.ToString() == "Shell_SecondaryTrayWnd";
    sb.Append("{\"fg\":").Append(fg.ToInt64()).Append(",\"taskbar\":").Append(taskbar ? "true" : "false")
      .Append(",\"ai\":").Append(Ai(fg))
      .Append(",\"game\":").Append(game == "" ? "null" : Json(game))
      .Append(",\"usb\":").Append(Usb())
      .Append(",\"call\":").Append(Call());
    if (titles && !taskbar) sb.Append(",\"app\":").Append(App(fg));
    lock (gate) sb.Append(",\"plug\":").Append(plug);
    sb.Append(",\"wins\":[");
    int count = 0;
    EnumWindows((h, l) => {
      if (count >= 40) return false;
      if (h.ToInt64() == self || !IsWindowVisible(h) || IsIconic(h)) return true;
      int ex = GetWindowLong(h, GWL_EXSTYLE);
      if ((ex & WS_EX_TOOLWINDOW) != 0 || (ex & WS_EX_NOACTIVATE) != 0) return true;
      int cloaked;
      if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) return true;
      var cls = new StringBuilder(64);
      GetClassName(h, cls, 64);
      string c = cls.ToString();
      if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd") return true;
      RECT r;
      if (DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, out r, 16) != 0) return true;
      if (r.Right - r.Left < 200 || r.Bottom - r.Top < 120) return true;
      if (count > 0) sb.Append(',');
      count++;
      sb.Append("{\"id\":").Append(h.ToInt64())
        .Append(",\"x\":").Append(r.Left).Append(",\"y\":").Append(r.Top)
        .Append(",\"w\":").Append(r.Right - r.Left).Append(",\"h\":").Append(r.Bottom - r.Top)
        .Append(",\"max\":").Append(IsZoomed(h) ? "true" : "false").Append('}');
      return true;
    }, IntPtr.Zero);
    sb.Append("]}");
    return sb.ToString();
  }
}
"@

[CapriWindows]::Init()
[CapriWindows]::Listen()
$last = ''
$tick = 0
while ($true) {
  $snap = [CapriWindows]::Snapshot($Self)
  if ($snap -ne $last) {
    [Console]::Out.WriteLine($snap)
    [Console]::Out.Flush()
    $last = $snap
  }
  # stop with Capri, even if she crashed without telling us
  $tick++
  if ($ParentPid -and ($tick % 20 -eq 0) -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 150
}

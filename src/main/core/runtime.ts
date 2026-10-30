/** DLL/运行库健康检测
 *
 * 设计原则：
 * 1. 只检测、不联网、不下载、不安装——零联网承诺
 * 2. 通过注册表 Uninstall 键 + Get-ItemProperty 版本对比
 * 3. 返回每个组件的 installed / version / downloadUrl
 */
import { runPowerShell } from './utils'

export interface RuntimeItem {
  id: string
  name: string
  category: 'vcpp' | 'dotnet' | 'directx' | 'vcredist'
  installed: boolean
  version: string | null
  arch: string
  downloadUrl: string
  note?: string
}

/** 检测所有 VC++、.NET Framework、DirectX、VC Redistributable */
export async function scanRuntimes(): Promise<RuntimeItem[]> {
  // 用数组 join 避免模板字符串里 PowerShell $var 被 TS 当变量解析
  const ps = [
    '$results = @()',
    '',
    '# ── VC++ Redistributable 各版本 ──',
    "$vcppVersions = @('2005', '2008', '2010', '2012', '2013', '2015-2022')",
    "$vcppArches = @('x64', 'x86')",
    'foreach ($v in $vcppVersions) {',
    '  foreach ($a in $vcppArches) {',
    '    $installed = $false',
    '    $ver = $null',
    '    foreach ($reg in @("HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",',
    '                       "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*")) {',
    '      try {',
    '        Get-ItemProperty $reg -ErrorAction SilentlyContinue | Where-Object {',
    '          $_.DisplayName -match "Microsoft Visual C\\+\\+ $v" -and $_.DisplayName -match $a',
    '        } | ForEach-Object {',
    '          $installed = $true',
    '          $ver = $_.DisplayVersion',
    '        }',
    '      } catch {}',
    '    }',
    '    $vid = "vcpp_" + $v + "_" + $a',
    '    $results += [PSCustomObject]@{',
    '      id = $vid',
    '      name = "VC++ " + $v + " (" + $a + ")"',
    "      category = 'vcpp'",
    '      installed = $installed',
    '      version = $ver',
    '      arch = $a',
    '    }',
    '  }',
    '}',
    '',
    '# ── .NET Framework ──',
    '$releaseMap = @{378389="4.5"; 379893="4.5.1"; 381029="4.5.2"; 393295="4.6"; 394254="4.6.1"; 394806="4.6.2"; 461808="4.7"; 461814="4.7.1"; 461818="4.7.2"; 528040="4.8"; 528372="4.8.1"; 533446="4.8.1"}',
    '$netRelease = $null',
    'try { $netRelease = (Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full" -ErrorAction SilentlyContinue).Release } catch {}',
    '$netVer = $null',
    'if ($netRelease -and $releaseMap.ContainsKey($netRelease)) { $netVer = $releaseMap[$netRelease] }',
    '$netInstalled = $null -ne $netRelease',
    '$results += [PSCustomObject]@{',
    '  id = "netfx_4x"',
    '  name = ".NET Framework 4.x"',
    "  category = 'dotnet'",
    '  installed = $netInstalled',
    '  version = if ($netInstalled) { $netVer } else { $null }',
    '  arch = "any"',
    '}',
    '',
    '# ── .NET Core / .NET 5+ SDK ──',
    '$dotnetCmd = Get-Command dotnet -ErrorAction SilentlyContinue',
    'if ($dotnetCmd) {',
    '  try {',
    '    $sdkList = & dotnet --list-sdks 2>$null',
    '    if ($LASTEXITCODE -eq 0 -and $sdkList) {',
    '      $results += [PSCustomObject]@{',
    '        id = "dotnet_sdk"',
    '        name = ".NET SDK"',
    "        category = 'dotnet'",
    '        installed = $true',
    '        version = ($sdkList -join ", ")',
    '        arch = "any"',
    '      }',
    '    }',
    '  } catch {}',
    '}',
    '',
    '# ── DirectX ──',
    '$dxVer = $null',
    'try { $dxVer = (Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\DirectX" -ErrorAction SilentlyContinue).InstalledVersion } catch {}',
    '$results += [PSCustomObject]@{',
    '  id = "directx"',
    '  name = "DirectX Runtime"',
    "  category = 'directx'",
    '  installed = $true',
    '  version = if ($dxVer) { $dxVer } else { "12 (built-in)" }',
    '  arch = "any"',
    '  note = "Win10/11 ships DirectX 12. Install DirectX End-User Runtime for legacy DLLs if games fail"',
    '}',
    '',
    '$results | ConvertTo-Json -Compress -Depth 3'
  ].join('\n')
  try {
    const out = await runPowerShell(ps, 30000)
    const items = JSON.parse(out.trim()) as Record<string, unknown>[]
    const DLS = DOWNLOAD_URLS()
    return items.map((it) => {
      const id = String(it.id)
      return {
        id,
        name: String(it.name),
        category: String(it.category) as RuntimeItem['category'],
        installed: Boolean(it.installed),
        version: it.version !== null && it.version !== undefined ? String(it.version) : null,
        arch: String(it.arch),
        downloadUrl: DLS[id] ?? DLS['_fallback'],
        note: it.note ? String(it.note) : undefined
      }
    })
  } catch (e) {
    return [{
      id: 'error', name: '检测失败', category: 'vcpp', installed: false,
      version: null, arch: 'any', downloadUrl: '', note: (e as Error).message
    }]
  }
}

function DOWNLOAD_URLS(): Record<string, string> {
  return {
    // VC++ — 微软官方
    vcpp_2005_x64: 'https://www.microsoft.com/en-us/download/details.aspx?id=14333',
    vcpp_2005_x86: 'https://www.microsoft.com/en-us/download/details.aspx?id=14333',
    vcpp_2008_x64: 'https://www.microsoft.com/en-us/download/details.aspx?id=15336',
    vcpp_2008_x86: 'https://www.microsoft.com/en-us/download/details.aspx?id=15336',
    vcpp_2010_x64: 'https://www.microsoft.com/en-us/download/details.aspx?id=14874',
    vcpp_2010_x86: 'https://www.microsoft.com/en-us/download/details.aspx?id=14874',
    vcpp_2012_x64: 'https://www.microsoft.com/en-us/download/details.aspx?id=30679',
    vcpp_2012_x86: 'https://www.microsoft.com/en-us/download/details.aspx?id=30679',
    vcpp_2013_x64: 'https://www.microsoft.com/en-us/download/details.aspx?id=40784',
    vcpp_2013_x86: 'https://www.microsoft.com/en-us/download/details.aspx?id=40784',
    'vcpp_2015-2022_x64': 'https://aka.ms/vs/17/release/vc_redist.x64.exe',
    'vcpp_2015-2022_x86': 'https://aka.ms/vs/17/release/vc_redist.x86.exe',
    // .NET
    netfx_4x: 'https://dotnet.microsoft.com/download/dotnet-framework',
    dotnet_sdk: 'https://dotnet.microsoft.com/download',
    // DirectX
    directx: 'https://www.microsoft.com/en-us/download/details.aspx?id=35',
    _fallback: 'https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist'
  }
}

/** 汇总：已安装数 / 总数 / 缺失项 */
export function summarize(items: RuntimeItem[]): { ok: number; total: number; missing: RuntimeItem[] } {
  const ok = items.filter((i) => i.installed).length
  const missing = items.filter((i) => !i.installed)
  return { ok, total: items.length, missing }
}

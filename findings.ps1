$exportMatches = Get-ChildItem -Path lib/actions/*.ts, lib/portal/*.ts | ForEach-Object { $file = $_.FullName; Get-Content $file | Where-Object { $_.Contains('export async function') -and $_.Contains('(') } | ForEach-Object { if ($_ -match 'export async function (\w+(FromForm|Archive|Cancel|Create|Update|Delete|Save|Send|Invite|Resend|Mark|Issue|Void|Finalize|Reject|Claim))') { [PSCustomObject]@{ File = $file; Function = $matches[1] } } } }
$testFiles = Get-ChildItem -Path lib/actions/__tests__/*scope-hardening*.test.ts, lib/portal/__tests__/*scope-hardening*.test.ts -ErrorAction SilentlyContinue 
$final = foreach ($item in $exportMatches) {
    $f = $item.Function
    $inTest = $false
    if ($testFiles) { foreach ($tf in $testFiles) { if (Select-String -Path $tf.FullName -Pattern $f -Quiet) { $inTest = $true; break } } }
    if (-not $inTest) {
        $caller = Get-ChildItem -Path app -Recurse -Include *.tsx, *.ts | Select-String -Pattern $f -List | Select-Object -First 1
        if ($caller) { [PSCustomObject]@{ Function = $f; File = $item.File; Caller = $caller.Path } }
    }
}
$final | Format-List Function, File, Caller

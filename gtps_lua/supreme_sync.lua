-- ============================================================
-- SUPREME CASINO - GTPS.CLOUD SYNC ENGINE v2.2
-- Dijalankan di: server GTPS gtps.cloud (dashboard -> Scripts)
--
-- CATATAN PENTING RUNTIME gtps.cloud (dari pengujian nyata):
-- - TIDAK ADA pcall / xpcall -> jangan pakai try-catch
-- - sqlite.open dipanggil dengan TITIK -> diganti total agar aman:
--   penyimpanan pakai saveStringToServer / loadStringFromServer
--   (API yang sama dengan server_utilities.lua)
-- - Method player pakai TITIK-DUA (player:getName dll) - terbukti jalan
--
-- KONTRAK DENGAN server.js (web casino di Render):
--   GTPS -> WEB (http:post/get):
--   GET  {WEB_API_URL}/gtps/check-link?code=XXXXXX
--   POST {WEB_API_URL}/gtps/link-growid       {growid, code, username}
--   POST {WEB_API_URL}/gtps/deposit-webhook   {growId, currency, amount, secretKey}
--   POST {WEB_API_URL}/gtps/withdraw-webhook  {growId, currency, amount, secretKey}
--
--   WEB -> GTPS (bridge onHTTPRequest):
--   URL dasar: https://api.gtps.cloud/g-api/{server_port}/...
--   GET  /supreme/ping
--   POST /supreme/withdraw   {secretKey, growId, currency, amount}
-- ============================================================

-- ============================================================
-- KONFIGURASI - WAJIB DIGANTI SEBELUM UPLOAD
-- ============================================================
local WEB_API_URL = "https://YOUR-CASINO-WEBSITE.onrender.com/api" -- TODO: ganti dengan URL web casino kamu (akhiran /api)
local SECRET_KEY  = "supreme_gtps_secret_auth_token_25741"         -- harus sama persis dengan server.js

local ITEM_WL  = 242
local ITEM_DL  = 1796
local ITEM_BGL = 7188

-- ============================================================
-- PENYIMPANAN (saveStringToServer / loadStringFromServer)
-- Format tiap baris: "A|username|saldo" (akun) / "L|growid|username" (link)
-- ============================================================
local STORE_KEY = "SUPREME_CASINO_DB_V1"

local accounts = {} -- username(lowercase) -> saldo DLS (number)
local links    = {} -- growid(lowercase)   -> username(lowercase)

local function cleanKey(s)
    return (tostring(s or ""):gsub("[|\r\n]", " "))
end

local function normUser(s)
    return string.lower(cleanKey(s))
end

local function loadStore()
    local raw = loadStringFromServer(STORE_KEY)
    if type(raw) ~= "string" or raw == "" or raw == "0" then return end
    for line in raw:gmatch("[^\r\n]+") do
        local kind, f1, f2 = line:match("^(%a)|([^|]*)|([^|]*)$")
        if kind == "A" then
            accounts[string.lower(f1)] = tonumber(f2) or 0
        elseif kind == "L" then
            links[string.lower(f1)] = string.lower(f2)
        end
    end
end

local function saveStore()
    local lines = {}
    for u, b in pairs(accounts) do
        table.insert(lines, "A|" .. u .. "|" .. tostring(b))
    end
    for g, u in pairs(links) do
        table.insert(lines, "L|" .. g .. "|" .. u)
    end
    saveStringToServer(STORE_KEY, table.concat(lines, "\n"))
end

loadStore()

local function getBalance(username)
    return accounts[normUser(username)] or 0
end

local function setBalance(username, amount)
    accounts[normUser(username)] = math.max(0, tonumber(amount) or 0)
    saveStore()
end

local function getLinkedUsername(growid)
    return links[normUser(growid)]
end

local function setLink(growid, username)
    links[normUser(growid)] = normUser(username)
    saveStore()
end

-- ============================================================
-- HTTP HELPERS (API gtps.cloud)
-- - WAJIB di dalam coroutine (yield saat menunggu respons)
-- - http:get(url, headers) / http:post(url, headers, body)
-- - Balikan: (body, status); status = -1 artinya gagal
-- - Request ke IP lokal/private DIBLOKIR -> web harus URL publik
-- - TANPA pcall (tidak ada di sandbox) -> argumen dibetulkan dulu
-- ============================================================
local JSON_HEADERS = { ["Content-Type"] = "application/json" }

local function jsonStrField(body, key)
    return tostring(body or ""):match('"' .. key .. '"%s*:%s*"([^"]*)"')
end

local function jsonNumField(body, key)
    local v = tostring(body or ""):match('"' .. key .. '"%s*:%s*(-?%d+%.?%d*)')
    return tonumber(v)
end

local function jsonEscape(s)
    s = tostring(s or ""):gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("[\r\n]", " ")
    return s
end

local function asyncPost(url, payload)
    if not http then
        print("[SUPREME] http API tidak tersedia!")
        return
    end
    coroutine.wrap(function()
        local body, status = http:post(url, JSON_HEADERS, tostring(payload or "{}"))
        if status ~= 200 then
            print("[SUPREME] HTTP POST status " .. tostring(status) .. ": " .. tostring(body))
        end
    end)()
end

local function asyncGet(url, callback)
    if not http then
        print("[SUPREME] http API tidak tersedia!")
        return
    end
    coroutine.wrap(function()
        local body, status = http:get(url, JSON_HEADERS)
        if status == 200 and body and callback then
            callback(tostring(body))
        end
    end)()
end

-- ============================================================
-- WEBHOOK ke website casino
-- ============================================================
local function webhookDeposit(growid, currency, amount)
    local payload = string.format(
        '{"growId":"%s","currency":"%s","amount":%d,"secretKey":"%s"}',
        jsonEscape(growid), jsonEscape(currency), math.floor(tonumber(amount) or 0), jsonEscape(SECRET_KEY)
    )
    asyncPost(WEB_API_URL .. "/gtps/deposit-webhook", payload)
end

local function webhookWithdraw(growid, currency, amount)
    local payload = string.format(
        '{"growId":"%s","currency":"%s","amount":%d,"secretKey":"%s"}',
        jsonEscape(growid), jsonEscape(currency), math.floor(tonumber(amount) or 0), jsonEscape(SECRET_KEY)
    )
    asyncPost(WEB_API_URL .. "/gtps/withdraw-webhook", payload)
end

local function webhookLink(growid, code, username)
    local payload = string.format(
        '{"growid":"%s","code":"%s","username":"%s"}',
        jsonEscape(growid), jsonEscape(code), jsonEscape(username)
    )
    asyncPost(WEB_API_URL .. "/gtps/link-growid", payload)
end

-- ============================================================
-- PROSES KODE LINK (dipanggil saat player /link atau isi dialog)
-- ============================================================
local function checkAndApplyCode(player, code)
    local growid = player:getName()
    local cleanCode = string.gsub(tostring(code or ""), "%D", "") -- buang semua non-digit
    if #cleanCode < 5 then
        player:onConsoleMessage("`4[SUPREME] Masukkan kode 6 digit dari website casino!``")
        return
    end

    asyncGet(WEB_API_URL .. "/gtps/check-link?code=" .. cleanCode, function(body)
        -- Contoh respons server.js:
        --   {"linked":true,"growId":"xxx","code":"123456","username":"budi"}
        --   {"linked":false,"code":"123456"}
        -- Username web dipakai kalau ada; kalau belum, fallback = kode.
        local username = jsonStrField(body, "username")
        if not username or username == "" then
            username = cleanCode
        end

        -- Simpan link + pastikan akun ada
        setLink(growid, username)
        if getBalance(username) == 0 then
            setBalance(username, 0)
        end

        -- Kabari website
        webhookLink(growid, cleanCode, username)

        player:onConsoleMessage("`2[SUPREME] Berhasil! GrowID `6" .. growid .. "`2 terhubung ke akun casino `6" .. username .. "`2!``")
        player:onConsoleMessage("`2[SUPREME] Ketik `6/balance`2 cek saldo, `6/deposit 10 dl`2 deposit, `6/withdraw 5 dl`2 withdraw!``")
    end)
end

-- ============================================================
-- DIALOG: /casino
-- ============================================================
local function dlgTheme(d)
    table.insert(d, "set_bg_color|18,22,34,235|\n")
    table.insert(d, "set_border_color|214,168,73,255|\n")
    table.insert(d, "set_default_color|`o\n")
end

local function showCasinoDialog(player)
    local growid = player:getName()
    local linkedUser = getLinkedUsername(growid)
    local bal = linkedUser and getBalance(linkedUser) or 0
    local siteUser = linkedUser or "(Belum linked)"

    local d = {}
    dlgTheme(d)
    table.insert(d, "add_label_with_icon|big|`6Supreme Casino Portal|left|14714|\n")
    table.insert(d, "add_smalltext|`9GTPS Cloud In-Game Cashier|\n")
    table.insert(d, "add_spacer|small|\n")
    table.insert(d, "add_textbox|`wGrowID: `2" .. growid .. "|\n")
    table.insert(d, "add_textbox|`wAkun Casino: `6" .. siteUser .. "|\n")
    table.insert(d, "add_textbox|`wSaldo: `2" .. math.floor(bal) .. " DLS `o(`2" .. string.format("%.2f", bal / 100) .. " BGL`o)|\n")
    table.insert(d, "add_spacer|small|\n")
    table.insert(d, "add_textbox|`6Perintah:|\n")
    table.insert(d, "add_smalltext|`w/deposit <jumlah> [wl|dl|bgl]|\n")
    table.insert(d, "add_smalltext|`w/withdraw <jumlah> [wl|dl|bgl]|\n")
    table.insert(d, "add_smalltext|`w/link <kode>  - Link akun web casino|\n")
    table.insert(d, "add_smalltext|`w/balance      - Cek saldo|\n")
    table.insert(d, "add_spacer|small|\n")
    table.insert(d, "add_button|btn_link|`6Masukkan Kode Link|staticYellowFrame|0|0\n")
    table.insert(d, "add_quick_exit|\n")
    table.insert(d, "end_dialog|supreme_casino_menu|Tutup||\n")

    player:onDialogRequest(table.concat(d))
end

-- ============================================================
-- DIALOG: input kode link
-- ============================================================
local function showLinkDialog(player)
    local d = {}
    dlgTheme(d)
    table.insert(d, "add_label_with_icon|big|`6Link Akun Casino|left|18|\n")
    table.insert(d, "add_smalltext|`9Hubungkan GrowID kamu dengan akun web casino!|\n")
    table.insert(d, "add_spacer|small|\n")
    table.insert(d, "add_textbox|`wGrowID kamu: `2" .. player:getName() .. "|\n")
    table.insert(d, "add_textbox|`6Masukkan kode 6 digit dari Web Casino -> Wallet -> Link GTPS:|\n")
    table.insert(d, "add_spacer|small|\n")
    table.insert(d, "add_text_input|inp_link_code|Kode 6 Digit:||6|\n")
    table.insert(d, "add_spacer|small|\n")
    table.insert(d, "add_quick_exit|\n")
    table.insert(d, "end_dialog|supreme_link_dialog|Batal|Link Sekarang|\n")

    player:onDialogRequest(table.concat(d))
end

-- ============================================================
-- COMMAND PROCESSOR
-- ============================================================
local function handleCommand(player, cmd, arg)
    local growid = player:getName()
    arg = tostring(arg or "")

    -- /casino | /supreme
    if cmd == "casino" or cmd == "supreme" then
        showCasinoDialog(player)
        return true
    end

    -- /casinohelp
    if cmd == "casinohelp" then
        player:onConsoleMessage("`6===== [ SUPREME CASINO ] =====``")
        player:onConsoleMessage("`2/casino `w- Buka panel casino``")
        player:onConsoleMessage("`2/deposit <jml> [wl|dl|bgl] `w- Deposit ke casino``")
        player:onConsoleMessage("`2/withdraw <jml> [wl|dl|bgl] `w- Withdraw ke backpack``")
        player:onConsoleMessage("`2/link <kode> `w- Link akun web casino``")
        player:onConsoleMessage("`2/balance `w- Cek saldo casino``")
        player:onConsoleMessage("`6================================``")
        return true
    end

    -- /link [kode]
    if cmd == "link" or cmd == "setgrowid" then
        if arg == "" then
            showLinkDialog(player)
        else
            checkAndApplyCode(player, arg)
        end
        return true
    end

    -- /balance | /bal
    if cmd == "balance" or cmd == "bal" then
        local linkedUser = getLinkedUsername(growid)
        if not linkedUser then
            player:onConsoleMessage("`4[SUPREME] Kamu belum link akun! Ketik `6/link <kode>`4 dulu.``")
            return true
        end
        local bal = getBalance(linkedUser)
        player:onConsoleMessage("`2[SUPREME] GrowID: `6" .. growid ..
            "` `w| Akun: `6" .. linkedUser ..
            "` `w| Saldo: `2" .. math.floor(bal) ..
            " DLS `w(`2" .. string.format("%.2f", bal / 100) .. " BGL`w)``")
        return true
    end

    -- /deposit <amount> [wl|dl|bgl]
    if cmd == "deposit" or cmd == "dep" then
        local amtStr, curStr = arg:match("^(%d+)%s*(%a*)$")
        local amt = tonumber(amtStr) or 0
        curStr = string.lower(curStr or "")
        if curStr == "" then curStr = "dl" end

        if amt <= 0 then
            player:onConsoleMessage("`4[SUPREME] Contoh: `6/deposit 50 dl`4 atau `6/deposit 1 bgl``")
            return true
        end

        local linkedUser = getLinkedUsername(growid)
        if not linkedUser then
            player:onConsoleMessage("`4[SUPREME] Kamu belum link akun casino! Ketik `6/link <kode>``")
            return true
        end

        local itemId, currencyName, dlsValue
        if curStr == "bgl" then
            itemId = ITEM_BGL; currencyName = "BGL"; dlsValue = amt * 100
        elseif curStr == "wl" then
            itemId = ITEM_WL;  currencyName = "WL";  dlsValue = amt / 100
        else
            itemId = ITEM_DL;  currencyName = "DL";  dlsValue = amt
        end

        local currentInInv = player:getItemAmount(itemId) or 0
        if currentInInv < amt then
            player:onConsoleMessage("`4[SUPREME] Item tidak cukup! Kamu punya " .. currentInInv ..
                " " .. currencyName .. ", butuh " .. amt .. "``")
            return true
        end

        -- Ambil item dari inventory (API: changeItem(id, count, addBackpack))
        if not player:changeItem(itemId, -amt, 0) then
            player:onConsoleMessage("`4[SUPREME] Gagal mengambil item dari inventory!``")
            return true
        end

        local newBal = getBalance(linkedUser) + dlsValue
        setBalance(linkedUser, newBal)

        player:onConsoleMessage("`2[SUPREME] Berhasil deposit `2" .. amt .. " " .. currencyName ..
            "`2! Saldo baru: `6" .. math.floor(newBal) .. " DLS``")

        webhookDeposit(growid, currencyName, amt)
        return true
    end

    -- /withdraw <amount> [wl|dl|bgl]
    if cmd == "withdraw" or cmd == "wd" or cmd == "with" then
        local amtStr, curStr = arg:match("^(%d+)%s*(%a*)$")
        local amt = tonumber(amtStr) or 0
        curStr = string.lower(curStr or "")
        if curStr == "" then curStr = "dl" end

        if amt <= 0 then
            player:onConsoleMessage("`4[SUPREME] Contoh: `6/withdraw 10 dl`4 atau `6/withdraw 1 bgl``")
            return true
        end

        local linkedUser = getLinkedUsername(growid)
        if not linkedUser then
            player:onConsoleMessage("`4[SUPREME] Kamu belum link akun casino! Ketik `6/link <kode>``")
            return true
        end

        local itemId, currencyName, dlsCost
        if curStr == "bgl" then
            itemId = ITEM_BGL; currencyName = "BGL"; dlsCost = amt * 100
        elseif curStr == "wl" then
            itemId = ITEM_WL;  currencyName = "WL";  dlsCost = amt / 100
        else
            itemId = ITEM_DL;  currencyName = "DL";  dlsCost = amt
        end

        local currentBal = getBalance(linkedUser)
        if currentBal + 1e-9 < dlsCost then
            player:onConsoleMessage("`4[SUPREME] Saldo tidak cukup! Saldo: `4" .. math.floor(currentBal) ..
                " DLS`4, butuh: `4" .. math.floor(dlsCost) .. " DLS``")
            return true
        end

        -- Cek ruang backpack dulu (API: canFit({ {id, count} }))
        if player.canFit and not player:canFit({ { id = itemId, count = amt } }) then
            player:onConsoleMessage("`4[SUPREME] Backpack penuh! Kosongkan slot dulu.``")
            return true
        end

        -- Beri item ke player
        local given = player:changeItem(itemId, amt, 0)
        if not given then
            given = player:changeItem(itemId, amt, 1)
        end
        if not given then
            player:onConsoleMessage("`4[SUPREME] Gagal memberi item! Saldo tidak dipotong.``")
            return true
        end

        setBalance(linkedUser, currentBal - dlsCost)

        player:onConsoleMessage("`2[SUPREME] Berhasil withdraw `2" .. amt .. " " .. currencyName ..
            "`2! Sudah masuk backpack. Sisa: `6" .. math.floor(currentBal - dlsCost) .. " DLS``")

        webhookWithdraw(growid, currencyName, amt)
        return true
    end

    return false
end

-- ============================================================
-- CALLBACK: onPlayerCommandCallback
-- Signature gtps.cloud: (world, player, fullCommand)
-- fullCommand = string penuh, contoh "deposit 50 dl" -> parse sendiri
-- ============================================================
if type(onPlayerCommandCallback) == "function" then
    onPlayerCommandCallback(function(world, player, fullCommand)
        if type(fullCommand) ~= "string" then return false end
        local cmd, arg = fullCommand:match("^(%S+)%s*(.*)")
        if not cmd then return false end
        cmd = cmd:lower():gsub("^/", "")
        return handleCommand(player, cmd, arg or "")
    end)
end

-- ============================================================
-- CALLBACK: onPlayerDialogCallback
-- Signature gtps.cloud: (world, player, data)
-- data.dialog_name = nama setelah end_dialog|
-- data.buttonClicked = tombol; nilai text_input = data.<nama_field>
-- ============================================================
if type(onPlayerDialogCallback) == "function" then
    onPlayerDialogCallback(function(world, player, data)
        if type(data) ~= "table" then return false end
        local dName = tostring(data.dialog_name or "")
        local btn   = tostring(data.buttonClicked or "")

        -- Dialog: input kode link
        if dName == "supreme_link_dialog" then
            if btn == "Batal" then return true end
            local code = tostring(data.inp_link_code or "")
            code = string.gsub(code, "%s+", "")
            if code ~= "" then
                checkAndApplyCode(player, code)
            else
                player:onConsoleMessage("`4[SUPREME] Kode tidak boleh kosong!``")
            end
            return true
        end

        -- Dialog: menu casino
        if dName == "supreme_casino_menu" then
            if btn == "btn_link" then
                showLinkDialog(player)
            end
            return true
        end

        return false
    end)
end

-- ============================================================
-- REGISTER COMMANDS (API gtps.cloud: registerLuaCommand)
-- roleRequired 0 = semua player boleh pakai
-- ============================================================
if type(registerLuaCommand) == "function" then
    local function reg(name, desc)
        registerLuaCommand({ command = name, roleRequired = 0, description = desc })
    end
    reg("casino",     "Buka panel Supreme Casino")
    reg("supreme",    "Buka panel Supreme Casino")
    reg("casinohelp", "Bantuan perintah Supreme Casino")
    reg("deposit",    "Deposit ke casino: /deposit <jml> [wl|dl|bgl]")
    reg("dep",        "Alias /deposit")
    reg("withdraw",   "Withdraw dari casino: /withdraw <jml> [wl|dl|bgl]")
    reg("wd",         "Alias /withdraw")
    reg("with",       "Alias /withdraw")
    reg("link",       "Link akun web casino: /link <kode 6 digit>")
    reg("balance",    "Cek saldo casino")
    reg("bal",        "Alias /balance")
else
    print("[SUPREME] registerLuaCommand tidak tersedia - command tetap jalan via callback")
end

-- ============================================================
-- BRIDGE: WEB -> GTPS (onHTTPRequest)
-- Dipanggil dari web via: https://api.gtps.cloud/g-api/{port}/supreme/...
-- PENTING: bridge ini TIDAK pakai auth dashboard gtps.cloud - siapa
-- pun yang tahu URL bisa menembak. Karena itu SEMUA endpoint yang
-- bisa mengubah data WAJIB memvalidasi secretKey (jangan hapus!).
-- ============================================================
local SERVER_PORT = 18876 -- fallback, dioverwrite di bawah
if type(getServerDefaultPort) == "function" then
    SERVER_PORT = getServerDefaultPort() or SERVER_PORT
end

local function jsonResponse(status, body)
    return {
        status = status,
        body = body,
        headers = { ["Content-Type"] = "application/json" }
    }
end

if type(onHTTPRequest) == "function" then
    onHTTPRequest(function(req)
        local method = string.lower(tostring(req.method or ""))
        local path = tostring(req.path or "")

        -- Health check: GET /supreme/ping
        if method == "get" and path == "/supreme/ping" then
            return jsonResponse(200, '{"ok":true,"script":"supreme_sync","port":' ..
                tostring(SERVER_PORT) .. '}')
        end

        -- Withdraw dari website: POST /supreme/withdraw
        -- Body: {"secretKey":"...","growId":"budi","currency":"DL","amount":10}
        if method == "post" and path == "/supreme/withdraw" then
            local body = tostring(req.body or "")

            if jsonStrField(body, "secretKey") ~= SECRET_KEY then
                return jsonResponse(403, '{"ok":false,"error":"invalid_secret_key"}')
            end

            local growId   = jsonStrField(body, "growId") or ""
            local currency = string.upper(jsonStrField(body, "currency") or "DL")
            local amount   = jsonNumField(body, "amount") or 0
            if growId == "" or amount <= 0 then
                return jsonResponse(400, '{"ok":false,"error":"growId_dan_amount_wajib"}')
            end

            local itemId, dlsCost
            if currency == "BGL" then
                itemId = ITEM_BGL; dlsCost = amount * 100
            elseif currency == "WL" then
                itemId = ITEM_WL;  dlsCost = amount / 100
            else
                currency = "DL"; itemId = ITEM_DL; dlsCost = amount
            end

            -- Pemain harus online
            local targets = getPlayerByName(growId)
            local target = type(targets) == "table" and targets[1] or nil
            if not target then
                return jsonResponse(404, '{"ok":false,"error":"player_offline"}')
            end

            -- Cek ledger (satu ledger dengan /withdraw in-game,
            -- supaya tidak bisa double-spend dari dua sisi)
            local linkedUser = getLinkedUsername(growId)
            if not linkedUser then
                return jsonResponse(404, '{"ok":false,"error":"growid_belum_link"}')
            end
            local bal = getBalance(linkedUser)
            if bal + 1e-9 < dlsCost then
                return jsonResponse(409, '{"ok":false,"error":"saldo_ledger_tidak_cukup"}')
            end

            -- Pastikan backpack muat dulu SEBELUM potong saldo
            if target.canFit and not target:canFit({ { id = itemId, count = amount } }) then
                return jsonResponse(409, '{"ok":false,"error":"backpack_penuh"}')
            end

            local given = target:changeItem(itemId, amount, 0)
            if not given then
                given = target:changeItem(itemId, amount, 1)
            end
            if not given then
                return jsonResponse(500, '{"ok":false,"error":"gagal_beri_item"}')
            end

            -- Ledger dipotong setelah item pasti tertanam
            setBalance(linkedUser, bal - dlsCost)

            target:onConsoleMessage("`2[SUPREME] Withdraw dari website: `2" .. amount .. " " ..
                currency .. "`2 masuk backpack! Sisa saldo: `6" .. math.floor(bal - dlsCost) .. " DLS``")

            return jsonResponse(200, '{"ok":true,"delivered":' .. amount ..
                ',"currency":"' .. currency .. '","growId":"' .. jsonEscape(growId) .. '"}')
        end

        return jsonResponse(404, '{"ok":false,"error":"not_found"}')
    end)
    print("[SUPREME] Bridge aktif: https://api.gtps.cloud/g-api/" .. tostring(SERVER_PORT) .. "/supreme/ping")
else
    print("[SUPREME] onHTTPRequest tidak tersedia di server ini!")
end

print("[SUPREME CASINO] Script loaded! Siap digunakan di gtps.cloud")
print("[SUPREME CASINO] Website API: " .. WEB_API_URL)

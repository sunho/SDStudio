-- 에셋 삽입 패턴
local pattern = "[Current date and time:*|*Location:(*)|*Character:*|*Emotion:(*)|*outfit:*|*Situation:*|*Inner*thoughts:*]"

-- 에셋 리스트
local standing_name = "curious"
local assets = {"Adventurers_Guild_Afternoon", "Adventurers_Guild_Morning", "Adventurers_Guild_Night", "Bedroom_Afternoon", "Bedroom_Morning", "Bedroom_Night", "Bookstore _Afternoon", "Bookstore_Morning", "Bookstore_Night", "Clothing_shop_Afternoon", "Clothing_shop_Morning", "Clothing_shop_Night", "Dungeon_Afternoon", "Dungeon_Morning", "Dungeon_Night", "Living_room_Afternoon", "Living_room_Morning", "Living_room_Night", "Magic_Classroom_Afternoon", "Magic_Classroom_Morning", "Magic_Classroom_Night", "Market_place_Afternoon", "Market_place_Morning", "Market_place_Night", "Mountain_Afternoon", "Mountain_Morning", "Mountain_Night", "Ocean_Afternoon", "Ocean_Morning", "Ocean_Night", "Park_Afternoon", "Park_Morning", "Park_Night", "Potion_Shop_Afternoon", "Potion_Shop_Morning", "Potion_Shop_Night", "Restaurant_Afternoon", "Restaurant_Morning", "Restaurant_Night", "Restroom_Afternoon", "Restroom_Morning", "Restroom_Night", "Street_Afternoon", "Street_Morning", "Street_Night", "Weapons_Shop_Afternoon", "Weapons_Shop_Morning", "Weapons_Shop_Night", "Yard_Afternoon", "Yard_Morning", "Yard_Night"}
local assets2 = {"After_sex", "angry", "annoyed", "aroused", "blushing_shyly", "bored", "childlike_whining", "comforted", "confused", "contemptuous", "coughing", "crying_with_eyes_closed", "crying_with_eyes open", "curious", "Dating_with_Adair", "dazed", "depressed", "disappointed", "disgusted", "embarrassed", "evil_smile", "fidgeting_shyly", "flustered", "forced_smile", "full-face_blush", "giggling", "guilty", "happy_smile", "indifferent", "Injured", "joyful", "laughing", "looking_away_shyly", "lovestuck", "nervous_pout", "nervous_smile", "nervous", "pout", "proud", "sad", "scared", "seductive_smile", "serious", "shocked", "Sleep", "sleepy", "smile", "smirk", "smug", "surprised", "thinking", "Use_magic_in_fight", "worried", "Magic class_"}
local asset_list = {
  [1]=assets,
  [2]=assets2
}

-- llm용 프롬프트 mini_llm은 사용하지 않음
local correction_prompt = [[
Here is the list of images that user typed in; $1
Correct the user's list of images based on the list of available images using clossest match.
ONLY use the image from this list: $2
<output format>
user input image:corrected image
</output format>
<output example>
love:lovestruck
joy:joyful
</output example>
Do not output anything else outside of the format specified above.
]]

local DEBUG = true

-- 의미 유사도 교정에 쓸 LLM 모델 선택 (기본: vector_embed)
VECTOR_EMBED="vector_embed"
SIMPLE_LLM="simple_llm"
FULL_LLM="full_llm"
local llm_method = VECTOR_EMBED

LIMIT_VECTOR_EMBED = 10 -- vector_emebed에 최대로 보낼 단어 수

-- 오타 교정에 쓸 알고리즘 선택 (기본: levenshtein)
SORT_LAVENSHTEIN = "levenshtein"
SORT_LCS_WITH_GAP = "lcs_with_gap"

local INITIAL_ERROR_RATE_THRESHOLD = 0
local FINAL_ERROR_RATE_THRESHOLD = 1.0

function create_prompt(images, all_assets)
  local prompt = correction_prompt:gsub("$1", table.concat(images, ", "))
  prompt = prompt:gsub("$2", table.concat(all_assets, ", "))
  return prompt
end

function string:split( inSplitPattern, outResults )
  if not outResults then
    outResults = { }
  end
  local theStart = 1
  local theSplitStart, theSplitEnd = string.find( self, inSplitPattern, theStart )
  while theSplitStart do
    table.insert( outResults, string.sub( self, theStart, theSplitStart-1 ) )
    theStart = theSplitEnd + 1
    theSplitStart, theSplitEnd = string.find( self, inSplitPattern, theStart )
  end
  table.insert( outResults, string.sub( self, theStart ) )
  return outResults
end

function process_response(images, response)
  local correction_pairs = response:split("\n")
  local images_map = {}
  for _, image in pairs(images) do
    images_map[image] = 1
  end
  local correction_map = {}
  for key, value in pairs(correction_pairs) do
    pair = value:split(":")
    if #pair == 2 and images_map[pair[1]] then
      correction_map[pair[1]] = pair[2]
    end
  end
  return correction_map
end

function escape(text)
  return text:gsub("([^%w])", "%%%1")
end

function translate(pattern)
  local codes = {}
  for p, c in utf8.codes(pattern) do
    table.insert(codes, utf8.char(c))
  end
  local out = {}
  local i = 1
  local stars = 0
  while i <= #codes do
    if codes[i] == "*" then
      if i - 1 >= 1 and i + 1 <= #codes then
        if codes[i - 1] == "(" and codes[i + 1] == ")" then
          table.remove(out)
          table.insert(out, '^')
          i = i + 2
          stars = stars + 1
          goto continue
        end
      end
    end
    table.insert(out, codes[i])
    i = i + 1
    ::continue::
  end
  pattern = table.concat(out)
  pattern = escape(pattern)
  gpattern = pattern:gsub("%%%*", "%%s*.-%%s*")
  gpattern = gpattern:gsub("%%%^", "%%s*.-%%s*")
  pattern = pattern:gsub("%%%*", "%%s*.-%%s*")
  pattern = pattern:gsub("%%%^", "%%s*()(.-)()%%s*")
  return gpattern, pattern, stars
end

function print_table(tbl)
  for key, value in pairs(tbl) do
    if type(value) == "table" then
      print(key)
      print_table(value)
    else
      print(key, value)
    end
  end
end

function edit_distance(str1, str2, cache)
  if cache[str1..'-'..str2] then
    return cache[str1..'-'..str2]
  end
  if cache[str2..'-'..str1] then
    return cache[str2..'-'..str1]
  end
  local len1 = #str1
  local len2 = #str2

  local dp = {}
  for i = 0, len1 do
      dp[i] = {}
      dp[i][0] = i
  end
  for j = 0, len2 do
      dp[0][j] = j
  end

  for i = 1, len1 do
      for j = 1, len2 do
          local cost = (str1:sub(i, i) == str2:sub(j, j)) and 0 or 2
          dp[i][j] = math.min(
              dp[i - 1][j] + 1,
              dp[i][j - 1] + 1,
              dp[i - 1][j - 1] + cost
          )
      end
  end

  cache[str1..'-'..str2] = dp[len1][len2]
  return dp[len1][len2]
end

local inf = math.huge

function lcs_with_gap(small, large, cache)
  if cache[small..'-'..large] then
    return cache[small..'-'..large]
  end
  if cache[large..'-'..small] then
    return cache[large..'-'..small]
  end
  local m = #small
  local n = #large
  local kk = math.min(m,n)

  local dp = {}
  for i = 0, m do
    dp[i] = {}
    for j = 0, n do
        dp[i][j] = {}
        for key = 0, kk do
          dp[i][j][key] = {}
          for key2 = 0, 1 do
            dp[i][j][key][key2] = inf
          end
        end
    end
  end

  dp[0][0][0][0] = 0

  for i = 0, m do
    for j = 0, n do
      for k = 0, kk  do
        if k < kk and i < m and j < n and small:sub(i + 1, i + 1) == large:sub(j + 1, j + 1) then
          dp[i + 1][j + 1][k + 1][1] = math.min(dp[i + 1][j + 1][k + 1][1], dp[i][j][k][0] + 1, dp[i][j][k][1])
        end
        if j + 1 <= n then
          dp[i][j + 1][k][0] = math.min(dp[i][j + 1][k][0], dp[i][j][k][0], dp[i][j][k][1])
        end
        if i + 1 <= m then
          dp[i + 1][j][k][0] = math.min(dp[i + 1][j][k][0], dp[i][j][k][0], dp[i][j][k][1])
        end
      end
    end
  end

  for k = kk, 0, -1 do
    local res = inf
    for i = 0, m do
      for j = 0, n do
        res = math.min(res, dp[i][j][k][0], dp[i][j][k][1])
      end
    end
    if res ~= inf then
      cache[small..'-'..large] = {-k, res}
      return {-k, res}
    end
  end

  cache[small..'-'..large] = {inf, inf}
  return {inf, inf}
end

function compare_pairs(pair1, pair2)
  if pair1[1] < pair2[1] then
      return true
  elseif pair1[1] > pair2[1] then
      return false
  else
      return pair1[2] < pair2[2]
  end
end

function sort_by_lcs(arr, target)
  cache = {}
  table.sort(arr, function(a, b)
    return compare_pairs(lcs_with_gap(a, target, cache), lcs_with_gap(b, target, cache))
  end)
end

function sort_by_edit_distance(arr, target)
  local cache = {}
  table.sort(arr, function(a, b)
    return edit_distance(a, target, cache) < edit_distance(b, target, cache)
  end)
end

function do_correction(asset_num, asset_name)
  local cloned = {}
  for i, asset in pairs(asset_list[asset_num]) do
    table.insert(cloned, asset)
  end
  local error_rate = 1.0
  if sorting_method == SORT_LAVENSHTEIN then
    sort_by_edit_distance(cloned, asset_name)
    local cache = {}
    local dist = edit_distance(cloned[1], asset_name, cache)
    error_rate = dist
  else
    sort_by_lcs(cloned, asset_name)
    local cache = {}
    local lcs = lcs_with_gap(cloned[1], asset_name, cache)
    error_rate = 1.0 + lcs[1] / #asset_name
  end
  return cloned[1], error_rate
end

function print_dbg(...)
  if DEBUG then
    print(...)
  end
end

function run(triggerId, text)
  -- lua 정규식으로 번역
  local lua_gpattern, lua_pattern, stars = translate(pattern)

  local results = {}
  for start_pos, match, end_pos in text:gmatch("()(" .. lua_gpattern .. ")()") do
    table.insert(results, { start_pos=start_pos, end_pos=end_pos , match = { match:match(lua_pattern) }})
  end

  -- 전처리 과정
  local captures = {}
  for i, match in ipairs(results) do
    for j = 1, stars do
      local st, cap, en = match.match[(j-1)*3+1], match.match[(j-1)*3+2], match.match[(j-1)*3+3]
      st = st + match.start_pos - 1
      en = en + match.start_pos - 1
      table.insert(captures, { num = j, cap = cap, start_pos = st, end_pos = en })
    end
  end

  local asset_map = {}
  for _, list in ipairs(asset_list) do
    for i, asset in pairs(list) do
      asset_map[asset] = 1
    end
  end
  local all_assets = {}
  for asset, _ in pairs(asset_map) do
    table.insert(all_assets, asset)
  end

  -- 패스 1: 오차가 적은 매칭은 편집 거리 오타 교정을 적용하고 후보에서 제거
  print_dbg("Pass 1 begins")
  print_dbg("--------------------------------")
  local bailed = 0
  for i, capture in ipairs(captures) do
    print_dbg("매치 " .. i .. ":")
    print_dbg("에셋 종류: " .. capture.num)
    print_dbg("기존: " .. capture.cap)
    sorting_method = SORT_LAVENSHTEIN
    corrected, error_rate = do_correction(capture.num, capture.cap)
    print_dbg("제안: " .. corrected)
    if error_rate < INITIAL_ERROR_RATE_THRESHOLD then
      captures[i].cap = corrected
      captures[i].done = true
      bailed = bailed + 1
      print_dbg("초기 교정 완료!")
    end
  end
  print_dbg("--------------------------------")
  print_dbg("Pass 1 ends")


  -- 패스 2: 로우 레벨 엑세스가 켜져 있으면 LLM으로 의미 유사도 교정을 시도
  print_dbg("Pass 2 begins")
  print_dbg("--------------------------------")
  -- 이미 모두 오차가 적으면 llm을 부를 이유가 없음
  if bailed ~= #captures then
    local images_map = {}
    for i, capture in ipairs(captures) do
      if not capture.done then
        images_map[capture.cap] = 1
      end
    end
    local images = {}
    for key, _ in pairs(images_map) do
      table.insert(images, key)
    end
    local prompt = create_prompt(images, all_assets)
    print_dbg("Prompt:" .. prompt)
    local llm_map = {}
    if llm_method == VECTOR_EMBED then
      for i, image in ipairs(images) do
        if i > LIMIT_VECTOR_EMBED then
          break
        end
        local res = similarity(triggerId, image, all_assets):await()
        if res then
          llm_map[image] = res[1]
        end
      end
    elseif llm_method == SIMPLE_LLM then
      local res = simpleLLM(triggerId, prompt):await()
      if res and res.success then
        llm_map = process_response(images, res.result)
      end
    else
      local res = LLMMain(triggerId, json.encode({{role="user",content=prompt}})):await()
      if res then
        local decoded = json.decode(res)
        if decoded.success then
          llm_map = process_response(images, decoded.result)
        end
      end
    end
    for i, capture in ipairs(captures) do
      if capture.done then
        goto continue2
      end
      print_dbg("매치 " .. i .. ":")
      print_dbg("에셋 종류: " .. capture.num)
      print_dbg("기존: " .. capture.cap)
      if llm_map[capture.cap] then
        capture.cap = llm_map[capture.cap]
        print_dbg("LLM으로 교정 완료: " .. capture.cap)
      end
      ::continue2::
    end
  end
  print_dbg("--------------------------------")
  print_dbg("Pass 2 ends")


  -- 패스 3: 마지막 오타 교정 및 스탠딩 에셋 치환 적용
  print_dbg("Pass 3 begins")
  print_dbg("--------------------------------")
  for i, capture in ipairs(captures) do
    if capture.done then
      goto continue3
    end
    print_dbg("매치 " .. i .. ":")
    print_dbg("에셋 종류: " .. capture.num)
    print_dbg("기존: " .. capture.cap)
    sorting_method = SORT_LCS_WITH_GAP
    corrected, error_rate = do_correction(capture.num, capture.cap)
    print_dbg("교정 제안: " .. corrected)
    if error_rate < FINAL_ERROR_RATE_THRESHOLD then
      captures[i].cap = corrected
      print_dbg("교정 완료!")
    else
      captures[i].cap = standing_name
      print_dbg("스탠딩 에셋 적용!")
    end
    ::continue3::
  end
  print_dbg("--------------------------------")
  print_dbg("Pass 3 ends")

  -- 계산된 교정 적용
  local pos = 1
  local cur = 1
  local new_text = ''
  while pos <= #text do
    if cur <= #captures and pos == captures[cur].start_pos then
      new_text = new_text .. captures[cur].cap
      pos = captures[cur].end_pos
      cur = cur + 1
    else
      new_text = new_text .. text:sub(pos, pos)
      pos = pos + 1
    end
  end

  return new_text
end

-- print(create_prompt({"banana", "cherry", "date", "elderberry"}))
-- print_table(process_response({"banana", "cherry", "date", "elderberry"}, "banana:banana\ncherry:cherry\ndate:date\nelderberry:elderberry\n"))
-- print(run(1,"[Current date and time: 1375-05-08 Monday 10:45 | Location: Living_room_Morning | Character: Adair | Emotion: curious | outfit: An elegant navy blue robe adorned with vibrant patterns | Situation: Showing sunho around the house interior | Inner thoughts: I hope sunho feels welcome here. Their eagerness to learn magic is quite endearing.]"))

onOutput = async(function(triggerId, data)
  local prompt = "1girl, maid"
  local neg = "bad anatomy, bad hands"
  local inlay = generateImage(triggerId, prompt, neg):await()
  print(inlay) -- 인레이 이미지가 출력됨
  -- local new_text = run(triggerId, data)
  addChat(triggerId, 'user', inlay)
end)

#include <napi.h>
#include <unordered_set>
#include <vector>
#include <string>
#include <sstream>
#include <array>
#include <iostream>
#include <deque>
#include <map>
#include <set>
#include <memory>
#include <algorithm>
#include <numeric>
#include <locale>
#include <codecvt>


const int INITIAL_CUTOFF = 1600;
const int FINAL_CUTOF = 256;

class Word {
public:
  std::wstring_view normalized;
  std::wstring_view shortened;
  std::wstring_view word;
  std::wstring_view redirect;
  int64_t freq;
  int category;
  int priority;
  Word(std::wstring_view normalized, std::wstring_view shortened, std::wstring_view word, std::wstring_view redirect, int64_t freq, int category, int priority) :
    normalized(normalized), shortened(shortened), word(word), redirect(redirect), freq(freq), category(category), priority(priority) {}
};

static inline bool beginsWith(std::wstring_view str, std::wstring_view prefix) {
  return str.size() >= prefix.size() && str.substr(0, prefix.size()) == prefix;
}

static inline bool endsWith(std::wstring_view str, std::wstring_view suffix) {
  return str.size() >= suffix.size() && str.substr(str.size() - suffix.size()) == suffix;
}

static inline std::vector<std::string> split(const std::string& str, char delim) {
  std::vector<std::string> result;
  size_t start = 0;
  for (size_t i = 0; i < str.size(); i++) {
    if (str[i] == delim) {
      result.push_back(str.substr(start, i - start));
      start = i + 1;
    }
  }
  result.push_back(str.substr(start));
  return result;
}

std::string join(const std::vector<std::string>& parts, char delim) {
  std::string result;
  for (size_t i = 0; i < parts.size(); i++) {
    if (i > 0) {
      result.push_back(delim);
    }
    result.append(parts[i]);
  }
  return result;
}

const int MAX_WORD_LEN = 64;

static inline int calcGapMatch(std::wstring_view small, std::wstring_view large) {
  if (beginsWith(large, small) || endsWith(large, small)) {
    return 0;
  }
  const int inf = 1e9;
  if (small.size() > MAX_WORD_LEN || large.size() > MAX_WORD_LEN) {
    std::cerr << "Word too long\n";
    return inf;
  }

  int m = small.size();
  int n = large.size();
  std::array<std::array<std::array<int,2>,MAX_WORD_LEN+1>,MAX_WORD_LEN+1> dp{};
  for (int i = 0; i <= m; i++) {
    for (int j = 0; j <= n; j++) {
      dp[i][j][0] = inf;
      dp[i][j][1] = inf;
    }
  }
  dp[0][0][0] = 0;
  for (int i=0;i<=m;i++){
    for (int j=0;j<n;j++){
      if (small[i] == large[j]) {
        dp[i+1][j+1][1] = std::min({dp[i+1][j+1][1], dp[i][j][0]+1, dp[i][j][1]});
      }
      dp[i][j+1][0] = std::min({dp[i][j+1][0], dp[i][j][0], dp[i][j][1]});
    }
  }
  return std::min(dp[m][n][0], dp[m][n][1]);
}

static inline std::wstring utf8ToUtf16(const std::string& utf8) {
  std::wstring utf16;
  for (size_t i = 0; i < utf8.size();) {
    uint32_t codepoint = 0;
    size_t additionalBytes = 0;
    
    if ((utf8[i] & 0x80) == 0) {
      codepoint = utf8[i];
      additionalBytes = 0;
    } else if ((utf8[i] & 0xE0) == 0xC0) {
      codepoint = utf8[i] & 0x1F;
      additionalBytes = 1;
    } else if ((utf8[i] & 0xF0) == 0xE0) {
      codepoint = utf8[i] & 0x0F;
      additionalBytes = 2;
    } else if ((utf8[i] & 0xF8) == 0xF0) {
      codepoint = utf8[i] & 0x07;
      additionalBytes = 3;
    } else {
      return L"";
    }

    if (i + additionalBytes >= utf8.size()) {
      return L"";
    }

    for (size_t j = 0; j < additionalBytes; ++j) {
      codepoint = (codepoint << 6) | (utf8[i + j + 1] & 0x3F);
    }

    if (codepoint <= 0xFFFF) {
      utf16.push_back(static_cast<wchar_t>(codepoint));
    } else {
      codepoint -= 0x10000;
      utf16.push_back(static_cast<wchar_t>(0xD800 + (codepoint >> 10)));
      utf16.push_back(static_cast<wchar_t>(0xDC00 + (codepoint & 0x3FF)));
    }

    i += additionalBytes + 1;
  }

  return utf16;
}

static inline std::string utf16ToUtf8(const std::wstring& utf16) {
    std::string utf8;
    for (size_t i = 0; i < utf16.size(); ++i) {
        uint32_t codepoint;

        if (utf16[i] >= 0xD800 && utf16[i] <= 0xDBFF) {
            if (i + 1 >= utf16.size() || utf16[i + 1] < 0xDC00 || utf16[i + 1] > 0xDFFF) {
                return "";
            }

            codepoint = 0x10000 + ((utf16[i] - 0xD800) << 10) + (utf16[i + 1] - 0xDC00);
            ++i;
        } else {
            codepoint = utf16[i];
        }

        if (codepoint <= 0x7F) {
            utf8.push_back(static_cast<char>(codepoint));
        } else if (codepoint <= 0x7FF) {
            utf8.push_back(static_cast<char>((codepoint >> 6) | 0xC0));
            utf8.push_back(static_cast<char>((codepoint & 0x3F) | 0x80));
        } else if (codepoint <= 0xFFFF) {
            utf8.push_back(static_cast<char>((codepoint >> 12) | 0xE0));
            utf8.push_back(static_cast<char>(((codepoint >> 6) & 0x3F) | 0x80));
            utf8.push_back(static_cast<char>((codepoint & 0x3F) | 0x80));
        } else {
            utf8.push_back(static_cast<char>((codepoint >> 18) | 0xF0));
            utf8.push_back(static_cast<char>(((codepoint >> 12) & 0x3F) | 0x80));
            utf8.push_back(static_cast<char>(((codepoint >> 6) & 0x3F) | 0x80));
            utf8.push_back(static_cast<char>((codepoint & 0x3F) | 0x80));
        }
    }

    return utf8;
}


static inline std::string utf16ToUtf8(std::wstring_view utf16) {
  return utf16ToUtf8(std::wstring(utf16));
}

class LiteralManager {
public:
    std::wstring_view getLiteral(const std::string& word) {
        std::wstring utf16Word = utf8ToUtf16(word);
        literals.push_back(std::move(utf16Word));
        return literals.back();
    }

    std::deque<std::wstring> literals;
};

static inline std::vector<uint32_t> utf8ToCodepoints(const std::string& utf8) {
  std::vector<uint32_t> codepoints;
  size_t i = 0;
  while (i < utf8.size()) {
      uint32_t codepoint = 0;
      unsigned char c = utf8[i];
      if (c < 0x80) {
          codepoint = c;
          i += 1;
      } else if (c < 0xE0) {
          codepoint = ((c & 0x1F) << 6) | (utf8[i + 1] & 0x3F);
          i += 2;
      } else if (c < 0xF0) {
          codepoint = ((c & 0x0F) << 12) | ((utf8[i + 1] & 0x3F) << 6) | (utf8[i + 2] & 0x3F);
          i += 3;
      } else {
          codepoint = ((c & 0x07) << 18) | ((utf8[i + 1] & 0x3F) << 12) | ((utf8[i + 2] & 0x3F) << 6) | (utf8[i + 3] & 0x3F);
          i += 4;
      }
      codepoints.push_back(codepoint);
  }
  return codepoints;
}

static inline std::string codepointToUtf8(char32_t codepoint) {
    std::string utf8_string;

    if (codepoint <= 0x7F) {
      utf8_string += static_cast<char>(codepoint);
    } else if (codepoint <= 0x7FF) {
      utf8_string += static_cast<char>(0xC0 | ((codepoint >> 6) & 0x1F));
      utf8_string += static_cast<char>(0x80 | (codepoint & 0x3F));
    } else if (codepoint <= 0xFFFF) {
      utf8_string += static_cast<char>(0xE0 | ((codepoint >> 12) & 0x0F));
      utf8_string += static_cast<char>(0x80 | ((codepoint >> 6) & 0x3F));
      utf8_string += static_cast<char>(0x80 | (codepoint & 0x3F));
    } else if (codepoint <= 0x10FFFF) {
      utf8_string += static_cast<char>(0xF0 | ((codepoint >> 18) & 0x07));
      utf8_string += static_cast<char>(0x80 | ((codepoint >> 12) & 0x3F));
      utf8_string += static_cast<char>(0x80 | ((codepoint >> 6) & 0x3F));
      utf8_string += static_cast<char>(0x80 | (codepoint & 0x3F));
    }

    return utf8_string;
}

static inline int lconToCjamo(int ch) {
    static const std::vector<int> table = {
        0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142,
        0x3143, 0x3145, 0x3146, 0x3147, 0x3148, 0x3149, 0x314a, 0x314b,
        0x314c, 0x314d, 0x314e
    };
    if (ch < 0x1100 || ch > 0x1112) {
        if (ch == 0x1140) return 0x317f;
        else if (ch == 0x114C) return 0x3181;
        else if (ch == 0x1159) return 0x3186;
        return ch;
    }
    return table[ch - 0x1100];
}

static inline int mvowToCjamo(int ch) {
    static const std::vector<int> table = {
        0x314f, 0x3150, 0x3151, 0x3152, 0x3153, 0x3154, 0x3155, 0x3156,
        0x3157, 0x3158, 0x3159, 0x315a, 0x315b, 0x315c, 0x315d, 0x315e,
        0x315f, 0x3160, 0x3161, 0x3162, 0x3163
    };
    if (ch < 0x1161 || ch > 0x1175) {
        if (ch == 0x119E) return 0x318D;
        return ch;
    }
    return table[ch - 0x1161];
}

static inline int fconToCjamo(int ch) {
    static const std::vector<int> table = {
        0x3131, 0x3132, 0x3133, 0x3134, 0x3135, 0x3136, 0x3137, 0x3139,
        0x313a, 0x313b, 0x313c, 0x313d, 0x313e, 0x313f, 0x3140, 0x3141,
        0x3142, 0x3144, 0x3145, 0x3146, 0x3147, 0x3148, 0x314a, 0x314b,
        0x314c, 0x314d, 0x314e
    };
    if (ch < 0x11a8 || ch > 0x11c2) {
        if (ch == 0x11EB) return 0x317f;
        else if (ch == 0x11F0) return 0x3181;
        else if (ch == 0x11F9) return 0x3186;
        return ch;
    }
    return table[ch - 0x11a8];
}

static inline std::string normalizeJamo(uint32_t code) {
  code = lconToCjamo(code);
  code = mvowToCjamo(code);
  code = fconToCjamo(code);

  static const std::unordered_map<std::string, std::string> _complexJamo = {
    {"ㅘ", "ㅗㅏ"}, {"ㅙ", "ㅗㅐ"}, {"ㅚ", "ㅗㅣ"}, {"ㅝ", "ㅜㅓ"},
    {"ㅞ", "ㅜㅔ"}, {"ㅟ", "ㅜㅣ"}, {"ㅢ", "ㅡㅣ"},
    {"ㄳ", "ㄱㅅ"}, {"ㄵ", "ㄴㅈ"}, {"ㄶ", "ㄴㅎ"}, {"ㄺ", "ㄹㄱ"},
    {"ㄻ", "ㄹㅁ"}, {"ㄼ", "ㄹㅂ"}, {"ㄽ", "ㄹㅅ"}, {"ㄾ", "ㄹㅌ"},
    {"ㄿ", "ㄹㅍ"}, {"ㅀ", "ㄹㅎ"}, {"ㅄ", "ㅂㅅ"},
    {"ㄲ", "ㄱㄱ"}, {"ㄸ", "ㄷㄷ"}, {"ㅃ", "ㅂㅂ"}, {"ㅆ", "ㅅㅅ"}, {"ㅉ", "ㅈㅈ"}
  };
  static const std::unordered_map<uint32_t, std::string> complexJamo = [] {
    std::unordered_map<uint32_t, std::string> result;
    for (const auto& [key, value] : _complexJamo) {
      const uint32_t code = utf8ToCodepoints(key)[0];
      result[code] = value;
    }
    return result;
  }();

  if (complexJamo.find(code) != complexJamo.end()) {
    return complexJamo.at(code);
  }
  return codepointToUtf8(code);
}

static inline std::string normalize(const std::string& word) {
  std::string result;
  std::vector<uint32_t> codepoints = utf8ToCodepoints(word);

  const auto append = [&](const std::string& str) {
    auto codepoints = utf8ToCodepoints(str);
    for (uint32_t code : codepoints) {
      result += normalizeJamo(code);
    }
  };

  for (uint32_t code : codepoints) {
    if (code >= 'A' && code <= 'Z') {
      result.push_back(code - 'A' + 'a');
    } else if ((code >= 'a' && code <= 'z') || (code >= '0' && code <= '9')) {
      result.push_back(code);
    } else if (code >= 0xAC00 && code <= 0xD7A3) {
      int code_offset = code - 0xAC00;
      int initial = code_offset / (21 * 28);
      int medial = (code_offset % (21 * 28)) / 28;
      int final = code_offset % 28;

      static const std::vector<std::string> initialJamos = {
        "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
        "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
      };
      static const std::vector<std::string> medialJamos = {
        "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
        "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"
      };
      static const std::vector<std::string> finalJamos = {
        "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
        "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
        "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
      };

      append(initialJamos[initial]);
      append(medialJamos[medial]);
      if (final != 0) {
        append(finalJamos[final]);
      }
    } else {
      append(codepointToUtf8(code));
    }
  }
  return result;
}

static inline std::string shorten(const std::string& word) {
  std::string result;
  std::vector<uint32_t> codepoints = utf8ToCodepoints(word);

  const uint32_t HANGUL_SYLLABLES_START = 0xAC00;
  const uint32_t HANGUL_SYLLABLES_END = 0xD7A3;
  const uint32_t CHOSUNG_BASE = 0x1100;

  bool containsKorean = false;
  for (uint32_t codepoint : codepoints) {
    if (codepoint >= HANGUL_SYLLABLES_START && codepoint <= HANGUL_SYLLABLES_END) {
      containsKorean = true;
      break;
    }
  }

  if (containsKorean) {
    for (uint32_t codepoint : codepoints) {
      if (codepoint >= HANGUL_SYLLABLES_START && codepoint <= HANGUL_SYLLABLES_END) {
        uint32_t chosungIndex = (codepoint - HANGUL_SYLLABLES_START) / (21 * 28);
        uint32_t chosungCodepoint = CHOSUNG_BASE + chosungIndex;
        result += normalizeJamo(chosungCodepoint);
      }
    }
  } else {
    bool newWord = true;
    for (uint32_t c : codepoints) {
      if (std::isspace(c)) {
        newWord = true;
      } else if (newWord && c >= 'a' && c <= 'z') {
        result += c;
        result += ' ';
        newWord = false;
      }
    }
  }
  return result;
}


class Database {
public:
  std::string name;
  LiteralManager lieteralManager;
  std::vector<Word> words;
  Database(const std::string& name) : name(name) {}
  void load(const std::string& csvData) {
    words.clear();
    lieteralManager.literals.clear();
    std::istringstream iss(csvData);
    std::string line;
    while (std::getline(iss, line)) {
      std::istringstream lineStream(line);
      std::string word, redirect;
      int64_t freq, category;
      std::getline(lineStream, word, ',');
      lineStream >> category;
      lineStream.ignore(1, ',');
      lineStream >> freq;
      lineStream.ignore(1, ',');
      std::getline(lineStream, redirect);
      if (word.size() > MAX_WORD_LEN || redirect.size() > MAX_WORD_LEN) {
        continue;
      }
      words.emplace_back(getLiteral(normalize(word)), getLiteral(shorten(word)), getLiteral(word), getLiteral(redirect), freq, category, 0);
    }
  }

  std::wstring_view getLiteral(const std::string& word) {
    return lieteralManager.getLiteral(word);
  }

  inline static bool isSubsequence(std::wstring_view small, std::wstring_view large) {
    int i = 0, j = 0;
    while (i < small.size() && j < large.size()) {
      if (small[i] == large[j]) {
        i++;
      }
      j++;
    }
    return i == small.size();
  }

  std::vector<Word> search(const std::string& word) {
    const std::wstring normalized = utf8ToUtf16(normalize(word));
    std::vector<Word> result_;
    std::unordered_set<std::wstring_view> seen;
    for (const auto& item : words) {
      if (isSubsequence(normalized, item.normalized)) {
        if (item.redirect == L"null")
          seen.insert(item.word);
        result_.push_back(item);
      }
      if (result_.size() >= INITIAL_CUTOFF) {
        break;
      }
    }
    std::vector<Word> result;
    for (const auto& item : result_) {
      if (item.redirect == L"null" || seen.find(item.redirect) == seen.end()) {
        result.push_back(item);
      }
    }
    std::vector<std::tuple<int,int,int,int>> scores;
    for (const auto& item : result) {
      scores.push_back({calcGapMatch(normalized, item.shortened), calcGapMatch(normalized, item.normalized), -item.priority, -item.freq});
    }
    std::vector<int> idx(result.size());
    std::iota(idx.begin(), idx.end(), 0);
    std::sort(idx.begin(), idx.end(), [&](int i, int j) {
      return scores[i] < scores[j];
    });
    std::vector<Word> sortedResult;
    for (int i = 0; i < std::min((int)result.size(), FINAL_CUTOF); i++) {
      sortedResult.push_back(result[idx[i]]);
    }
    return sortedResult;
  }
};

class DatabaseRepository {
public:
  std::map<int, std::unique_ptr<Database>> databases;
  int nextId = 0;
  DatabaseRepository() = default;
  void create(const std::string& name) {
    databases[nextId] = std::make_unique<Database>(name);
    nextId++;
  }
  Database& get(int id) {
    return *databases[id];
  }
  void release(int id) {
    databases.erase(id);
  }
};

class SDSAddOn : public Napi::Addon<SDSAddOn> {
 public:
  DatabaseRepository dbRepo;
  SDSAddOn(Napi::Env env, Napi::Object exports) {
    DefineAddon(exports,
                {InstanceMethod("createDB", &SDSAddOn::createDB, napi_enumerable)});
    DefineAddon(exports,
                {InstanceMethod("search", &SDSAddOn::search, napi_enumerable)});
    DefineAddon(exports,
                {InstanceMethod("loadDB", &SDSAddOn::loadDB, napi_enumerable)});
    DefineAddon(exports,
                {InstanceMethod("releaseDB", &SDSAddOn::releaseDB, napi_enumerable)});
  }

 private:
  Napi::Value createDB(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::String input = info[0].As<Napi::String>();
    std::string name = input.Utf8Value();
    dbRepo.create(name);
    return Napi::Number::New(env, dbRepo.nextId - 1);
  }

  Napi::Value search(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Number id = info[0].As<Napi::Number>();
    Napi::String input = info[1].As<Napi::String>();
    Database& db = dbRepo.get(id.Int32Value());
    std::vector<Word> result = db.search(input.Utf8Value());
    Napi::Array output = Napi::Array::New(env, result.size());
    for (size_t i = 0; i < result.size(); i++) {
      Napi::Object obj = Napi::Object::New(env);
      obj.Set("normalized", Napi::String::New(env, utf16ToUtf8(result[i].normalized)));
      obj.Set("shortened", Napi::String::New(env, utf16ToUtf8(result[i].shortened)));
      obj.Set("word", Napi::String::New(env, utf16ToUtf8(result[i].word)));
      obj.Set("redirect", Napi::String::New(env, utf16ToUtf8(result[i].redirect)));
      obj.Set("freq", Napi::Number::New(env, result[i].freq));
      obj.Set("priority", Napi::Number::New(env, result[i].priority));
      obj.Set("category", Napi::Number::New(env, result[i].category));
      output[i] = obj;
    }
    return output;
  }

  Napi::Value loadDB(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Number id = info[0].As<Napi::Number>();
    Napi::String input = info[1].As<Napi::String>();
    Database& db = dbRepo.get(id.Int32Value());
    db.load(input.Utf8Value());
    return env.Undefined();
  }

  Napi::Value releaseDB(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Number id = info[0].As<Napi::Number>();
    dbRepo.release(id.Int32Value());
    return env.Undefined();
  }
};

NODE_API_ADDON(SDSAddOn)


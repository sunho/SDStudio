#include <napi.h>
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

const int INITIAL_CUTOFF = 1600;
const int FINAL_CUTOF = 128;

class Word {
public:
  std::string_view normalized;
  std::string_view word;
  std::string_view redirect;
  int64_t freq;
  int category;
  int priority;
  Word(std::string_view normalized, std::string_view word, std::string_view redirect, int64_t freq, int category, int priority) :
    normalized(normalized), word(word), redirect(redirect), freq(freq), category(category), priority(priority) {}
};

static inline bool beginsWith(std::string_view str, std::string_view prefix) {
  return str.size() >= prefix.size() && str.substr(0, prefix.size()) == prefix;
}

static inline bool endsWith(std::string_view str, std::string_view suffix) {
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

static inline int calcGapMatch(std::string_view small, std::string_view large) {
  if (beginsWith(large, small) || endsWith(large, small)) {
    return 0;
  }

  int m = small.size();
  int n = large.size();
  const int inf = 1e9;
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

class Database {
public:
  std::string name;
  std::deque<std::string> literals;
  std::vector<Word> words;
  Database(const std::string& name) : name(name) {}
  void load(const std::string& csvData) {
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
      words.emplace_back(getLiteral(normalize(word)), getLiteral(word), getLiteral(redirect), freq, category, 0);
    }
  }

  std::string normalize(const std::string& word) {
    std::string result;
    for (char c : word) {
      if (c >= 'A' && c <= 'Z') {
        result.push_back(c - 'A' + 'a');
      } else if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
        result.push_back(c);
      } else {
        result.push_back(c);
      }
    }
    /* const std::set<std::string> stopWords = { */
    /*   "a", "an", "the", "of", "in", "on", "at", "to", "for", "by", "with", "as", "and", "or", "but", */
    /*   "under", "over", "above", "below", "between", "among", "through", "into", "onto", "from", "since", */
    /*   "after", "before", "during", "while", "until", "throughout", "within", "without", "about", "against", */
    /*   "along", "around", "before", "behind", "beneath", "beside", "besides", "beyond", "inside", "outside"}; */
    /* const auto words = split(result, ' '); */
    /* std::vector<std::string> filteredWords; */
    /* for (const auto& word : words) { */
    /*   if (stopWords.find(word) == stopWords.end()) { */
    /*     filteredWords.push_back(word); */
    /*   } */
    /* } */
    /* return join(filteredWords, ' '); */
    return result;
  }

  std::string_view getLiteral(const std::string& word) {
    literals.push_back(word);
    return literals.back();
  }

  inline static bool isSubsequence(std::string_view small, std::string_view large) {
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
    const std::string normalized = normalize(word);
    std::vector<Word> result;
    for (const auto& item : words) {
      if (isSubsequence(normalized, item.normalized)) {
        result.push_back(item);
      }
      if (result.size() >= INITIAL_CUTOFF) {
        break;
      }
    }
    std::vector<std::tuple<int,int,int>> scores;
    for (const auto& item : result) {
      scores.push_back({calcGapMatch(normalized, item.normalized), -item.priority, -item.freq});
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
      obj.Set("normalized", Napi::String::New(env, std::string(result[i].normalized)));
      obj.Set("word", Napi::String::New(env, std::string(result[i].word)));
      obj.Set("redirect", Napi::String::New(env, std::string(result[i].redirect)));
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


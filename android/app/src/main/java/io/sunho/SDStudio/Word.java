package io.sunho.SDStudio;
public class Word {
  public String normalized;
  public String shortened;
  public String word;
  public String redirect;
  public int freq;
  public int priority;
  public int category;

  public Word(String normalized, String shortened, String word, String redirect, int freq, int priority, int category) {
    this.normalized = normalized;
    this.shortened = shortened;
    this.word = word;
    this.redirect = redirect;
    this.freq = freq;
    this.priority = priority;
    this.category = category;
  }
}

#!/usr/bin/python
"""Add assessors from file

Usage:
    python addAssessors.py -f [infile]
"""

import sys
import os
import argparse
import math
import random
import tweepy
import json

from subprocess import call

rel2id = {"notrel": 0, "rel": 1, "dup": 2}

def generate_assessor_id():
    chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    key = ''
    for i in range(12):
      index = math.floor(random.random() * len(chars))
      key += chars[index]
    return key

def get_assessors(infile):
  assessors = []
  with open(infile, 'r') as f:
    for line in f:
      items = line.split("|")
      first_name = items[0].strip()
      last_name = items[1].strip()
      email = items[2].strip()
      twitterhandle = items[3].strip()
      partid = generate_assessor_id()
      assessor = (partid, email, twitterhandle)
      assessors.append(assessor)

  return assessors

def execute_sql_command(sql_command):
  # ToDo: make it secure
  command = "mysql -u royal -e \'USE trec_rts; {}\'".format(sql_command)
  # print(command)
  try:
    call(command, shell=True)
  except Exception as e:
    print("ERROR: executing SQL command:\n{}".format(command))
    print(e)
    sys.exit()


def add_to_participants(partid, email, handle):
  sql_command = "INSERT INTO participants (partid, email, twitterhandle, deviceid) VALUES (\"{}\", \"{}\", \"{}\", NULL);".format(partid, email, handle)
  execute_sql_command(sql_command)

def get_followers(api):
  followers_list = api.followers()
  followers_names_set = set()
  for fol in followers_list:
    followers_names_set.add( fol.screen_name.lower() )
  return followers_names_set

def add_assessors(configfile, infile):
    config = json.loads( open(configfile).read() )
    auth = tweepy.OAuthHandler(config['consumer_key'], config['consumer_secret'])
    auth.set_access_token(config['access_token_key'], config['access_token_secret'])
    api = tweepy.API(auth)
    followers = get_followers(api)

    assessors = get_assessors(infile)
    for i, assessor in enumerate(assessors):
      partid, email, twitterhandle = assessor
      print("{} - {} - {}".format(partid, email, twitterhandle))

      # follow twitterhandle
      try:
        api.create_friendship(twitterhandle)
      except:
        print("ERROR: Could not FOLLOW user: {}".format(twitterhandle))

      # add to participants table
      add_to_participants(partid, email, twitterhandle)

    return assessors

if __name__ == "__main__":
  parser = argparse.ArgumentParser(description="Add assessors from file")
  parser.add_argument('-c','--config', help="config file with Twitter info", type=str, required=True)
  parser.add_argument('-f','--file', help="filepath which contains info about assessors", type=str, required=True)
  args=parser.parse_args()
  try:
    assessors_info = add_assessors(args.config, args.file)
    print("ASSESSORS:")
    for assessor in assessors_info:
      print(assessor)
  except Exception as e:
    print(e)


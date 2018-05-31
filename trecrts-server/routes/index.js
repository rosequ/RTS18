module.exports = function(io){
  const util = require('util');
  var express = require('express');
  var bodyParser = require('body-parser');
  var router = express.Router();
  const { WebClient } = require('@slack/client');
  var request = require('request');

  // make it an env variable after
  const token = 'xoxb-129293381650-372829510465-l68A2pF98gXWTnBP2aDHPuGD';

  // Initialize and start the Web Client for Slack
  const web = new WebClient(token);
  
  const button = [{"text": "",
                            "fallback": "You are unable to choose an option",
                            "callback_id": "relevance",
                            "color": "#3AA3E3",
                            "attachment_type": "default",
                            "actions": [
                                {"name": "relevant",
                                 "text": ":thumbsup:",
                                 "type": "button",
                                 "value": "relevant"},
                                {"name": "non-relevant",
                                 "text": ":thumbsdown:",
                                 "type": "button",
                                 "value": "notrelevant"},
                                {"name": "redundant",
                                 "text": ":fist:",
                                 "type": "button",
                                 "value": "redundant",
                    			}
                                 ]}]

  var urlencodedParser = bodyParser.urlencoded({ extended: false });

  var registrationIds = []; // containts partids of all participants
  var loaded = false;
  var regIdx = 0;
  //Todo: revert this to 10
  const RATE_LIMIT = 10000000; // max num of tweets per topic per client
  const ASSESSMENTS_PULL_LIMIT = 1; // max num of times client can pull assessments per 10 minutes
  const MAX_ASS = 3;
  const MAX_CLIENTS = 3;

  function genID(){
    var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    var ID = '';
    for(var i=0; i < 12; i++)
      ID += chars.charAt(Math.floor(Math.random()*chars.length));
    return ID;
  }

  function send_tweet_socket(tweet,socket){
    socket.emit('tweet',tweet);
  }

  function find_user(partid){
    for (var idx = 0; idx < registrationIds.length; idx++){
      if(registrationIds[idx].partid === partid)
        return idx;
    }
    return -1;
  }


  function send_tweet_dm(db, tweet, partid, conversationId) {
    // console.log("hello")
    console.log(conversationId);
    var text = "\nTopic: " + tweet["topid"] + " - " + tweet["topic"] + "\n" + "https://twitter.com/432142134/status/1000812604904824832";
	web.chat.postMessage({ channel: conversationId, text: text, as_user: true, attachments: button})
  	.then((res) => {
    // `res` contains information about the posted message
    console.log('Message sent: ');
  	})
  	.catch(console.error);
  }



  // tweet: {"tweetid":tweetid, "topid":topid, "topic":title}
  // interestIDs are partids of participants who are assigned to this topic (topicid)
  function send_tweet(db, tweet, interestIDs){
    for (var i = 0; i < interestIDs.length; i++){
      var id = interestIDs[i]
      // console.log("id : " + id)
      // console.log("registrationIds: " + registrationIds)

      var idx = find_user(id);
      // console.log("idx: " + idx)
      if (idx === -1)
        continue;
      var currPart = registrationIds[idx];
      send_tweet_dm(db, tweet, currPart['partid'], currPart['twitterhandle']);
    }
  }

  function validate(db,table,col, id,cb){
    db.query('select * from '+table+' where '+col+' = ?;',[id],cb);
  }

  function validate_group(db,groupid,cb){
    validate(db,'groups','groupid',groupid,cb);
  }

  function validate_client(db,clientid,cb){
    validate(db,'clients','clientid',clientid,cb);
  }

  function validate_participant(db,partid,cb){
    validate(db,'participants','partid',partid,cb);
  }
  function validate_client_or_participant(db,uniqid,cb){
    validate_client(db,uniqid,function(errors,results){
      if(errors || results.length === 0){
        validate_participant(db,uniqid,cb);
      }else{
        cb(errors,results);
      }
    });
  }
  function isValidTweet(str){
    return str.match('[0-9]=') !== null
  }

  var rel2id = {"notrel": 0, "rel": 1, "dup": 2}
	
  function sendMessageToSlackResponseURL(actionJSONPayload){
	  //   var postOptions = {
	  //       uri: response_url,
	  //       method: 'POST',
	  //       headers: {
	  //           'Content-type': 'application/json'
	  //       },
	  //       json: {
			//   "response_type": "ephemeral",
			//   "replace_original": true,
			//   "text": "Yay! you assessed it!"
			// }
	  //   }
	  //   request(postOptions, (error, response, body) => {
	  //       if (error){
	  //       	console.log(error);
	  //           // handle errors as you see fit
	  //       }
	  //   })
	    web.chat.update({channel: actionJSONPayload.channel.id, text:'You have clicked this!', ts:actionJSONPayload.message_ts, attachments:[]})
	}
  
  router.post('/slack/message_actions', urlencodedParser, (req, res) =>{
  	console.log("received the action");
    res.status(200).end() // best practice to respond with 200 status
    var actionJSONPayload = JSON.parse(req.body.payload) // parse URL-encoded payload JSON string
    // console.log(actionJSONPayload)
    var message = {
        "text": actionJSONPayload.user.name+" clicked: "+actionJSONPayload.actions[0].name,
        "replace_original": false
    }

    selection = actionJSONPayload["actions"][0]["value"]

    var  message_text = ""
    if (selection == "relevant"){
       message_text = "RELEVANT"
    }
   	else if (selection == "notrelevant"){
       message_text = "NOT RELEVANT"
   	} else {
   		message_text = "REDUNDANT"
   	}

   // web.chat.update({
   //   channel=actionJSONPayload["channel"]["id"],
   //   ts=actionJSONPayload["message_ts"],
   //   text="You have judged this tweet as " + message_text
   //   attachments=[] // empty `attachments` to clear the existing massage attachments
   // });

   console.log(message_text)
   console.log(actionJSONPayload)
   sendMessageToSlackResponseURL(actionJSONPayload)
});

  // ToDo: Change this part to get assessments from Slack
  // store judgements in the DB
  router.post('/judge/:topid/:tweetid/:rel/:partid', function(req,res){
    var topid = req.params.topid;
    var tweetid = req.params.tweetid;
    var rel = req.params.rel;
    var partid = req.params.partid;
    
    var devicetype = req.device.type.toLowerCase(); 
    // console.log("devicetype - ", devicetype);

    var db = req.db;
    // validate partid 
    db.query('select * from participants where partid = ?;',partid,function(errors0,results0){
      if(errors0 || results0.length === 0) {
        res.status(500).json({'message':'Invalid participant: ' + partid});
        return;
      }

      // validate topid for this partid
      db.query('select * from topic_assignments where topid = ? and partid = ?;',[topid, partid],function(errors1,results1){
        if(errors1 || results1.length === 0) {
          res.status(500).json({'message':'Unable to identify participant: ' + partid + ' for topic: ' + topid});
          return;
        }

        // insert judgement into DB
        db.query('insert judgements (assessor,topid,tweetid,rel,devicetype) values (?,?,?,?,?) ON DUPLICATE KEY UPDATE rel=?, submitted=NOW()',
                                        [partid,topid,tweetid,rel,devicetype,rel],function(errors,results){
          if(errors){
            console.log(errors)
            console.log("Unable to log: ",topid," ",tweetid," ",rel," ",devicetype);
            res.status(500).json({message : 'Unable to insert/update relevance assessment'})
          } else {
            console.log("Logged: ",topid," ",tweetid," ",rel," ",devicetype);
            // res.send('Success! Stored/Updated the relevance judgement.')
            res.render('judgement-store-msg', { judgement: rel });
          }
        });
      });
    });    
  });

  // clients get back live assessments for the tweets posted for this topic
  router.post('/assessments/:topid/:clientid',function(req,res){
    var topid = req.params.topid;
    var tweetid = req.params.tweetid;
    var clientid = req.params.clientid;
    var db = req.db;
    // validate client (client exists) with clientid
    validate_client(db,clientid,function(errors,results){
      if(errors || results.length === 0){
        res.status(500).json({'message':'Could not validate client: ' + clientid})
        return;
      }
      // check topic exists with topicid
      db.query('select topid from topics where topid = ?;',topid,function(terr,tres){
        if(terr || tres.length === 0){
          res.status(500).json({'message':'Invalid topic identifier: ' + topid});
          return;
        }

        // check that this client did not check for live assessments too many times - RATE LIMIT - 1 per 10 minutes
        db.query('select count(*) as cnt from assessments_pulled where clientid = ? and topid = ? and submitted between DATE_SUB(NOW(),INTERVAL 10 MINUTE) and NOW();', [clientid, topid], function(errors0,results0){
          if(errors0 || results0.length === 0){
            res.status(500).json({'message':'Could not process live assessments for topid, clientid: ' + topid + ' and ' + clientid});
            return;
          }else if(results0[0].cnt >= ASSESSMENTS_PULL_LIMIT){
            res.status(429).json({'message':'Rate limit exceeded (1 per 10 minutes) for pulling live assessments for topid, clientid: ' + topid + ' and ' + clientid});
            return;
          }          

          var join_query = `
            SELECT DISTINCT judgements.topid, judgements.tweetid, judgements.rel, judgements.submitted
            FROM judgements INNER JOIN requests
                ON judgements.topid=requests.topid AND judgements.tweetid = requests.tweetid
            WHERE requests.clientid = ? and requests.topid = ?;
          `
          db.query(join_query, [clientid, topid], function(errors2,results2){
            if(errors2){
              res.status(500).json({'message':'Could not process request (join) for client, topic: ' + clientid + ', ' + topid});
              return;
            }
            
            // gotta check last pulled before insert this entry to assessments_pulled
            db.query('SELECT MAX(submitted) as last FROM assessments_pulled WHERE clientid=? AND topid=?;', [clientid, topid], function(errors3,results3){
              if(errors3){
                res.status(500).json({'message':'Could not process request (last submitted) for client, topic: ' + clientid + ', ' + topid});
                return;
              }              
              // final_results: list of relevance judgements & last_submitted time 
              var final_results = { judgements: results2, last_pulled: results3[0].last }

              // insert into assessments_pulled table the topicid, clientid
              db.query('insert assessments_pulled (clientid, topid) values (?,?);',[clientid, topid], function(errors1,results1){
                if(errors1 || results1.length === 0){
                  res.status(500).json({'message':'Could not process request (insert assessments_pulled) for topid, clientid: ' + topid + ' and ' + clientid});
                  return;
                }
                res.json(final_results); //send back the live assessments
              });

            });
          });          
        });
      });
    });
  });

  router.get('/validate/part/:partid',function(req,res){
    var partid = req.params.partid;
    var db = req.db;
    validate_participant(db,partid,function(errors0,results0){
      if (errors0 || results0.length === 0){
        res.status(500).json({'message': 'Unable to validate client: ' + clientid})
        return;
      }else{
        res.status(204).send()
      }
    });
  });

  router.post('/register/mobile/',function(req,res){
    var db = req.db;
    var regid = req.body.regid;
    var partid = req.body.partid;
    var device = req.body.device;
    // At least one reg id required
    db.query('select * from participants where partid = ?;',partid,function(errors0,results0){
      if(errors0 || results0.length === 0){
        res.status(500).json({'message':'Unable to identify participant: ' + partid});
        return;
      }
      var idx = find_user(partid)
      if ( idx === -1 ){
        if (device === "iOS")
          registrationIds.push({'partid':partid,'type':'apn','conn':regid});
        else
          registrationIds.push({'partid':partid,'type':'gcm','conn':regid});
        db.query('update participants set deviceid = ? where partid = ?;',[regid,partid],function(errors1,results1){
          if(errors1){
            console.log('Unable to update device for partid: ', partid, regid);
          }
       });
      }else{
         registrationIds[idx].conn = regid;
         registrationIds[idx].type = device
         db.query('update participants set deviceid = ?, platform = ? where partid = ?;',[regid,partid,device],function(errors1,results1){
           if(errors1){
             console.log('Unable to update device for partid: ', partid, regid);
           }
         });
      }
      res.status(204).send();
      // Definitely need to do something better here
      /*
      if(tweet_queue.length > 0){
        for(var i = 0; i < tweet_queue.length; i++){
          send_tweet(tweet_queue[i]);
        }
        tweet_queue = [];
      }
      */
    });
  });


  // TODO: Need to enforce topid is valid
  // Push tweets to the assessors as and when they arrive
  router.post('/tweet/:topid/:tweetid/:clientid',function(req,res){
    var topid = req.params.topid;
    var tweetid = req.params.tweetid;
    var clientid = req.params.clientid;
    var db = req.db;
    // validate client (client exists) with clientid
    validate_client(db,clientid,function(errors,results){
      if(errors || results.length === 0){
        res.status(500).json({'message':'Could not validate client: ' + clientid})
        return;
      }
      // check topic exists with topicid
      db.query('select topid from topics where topid = ?;',topid,function(terr,tres){
        if(terr || tres.length === 0){
          res.status(500).json({'message':'Invalid topic identifier: ' + topid});
          return;
        }
        // check that this client did not post too many tweets (count) for this topicid
        db.query('select count(*) as cnt from requests where clientid = ? and topid = ? and submitted between DATE_SUB(NOW(),INTERVAL 1 DAY) and NOW();', [clientid, topid], function(errors0,results0){
          if(errors0 || results0.length === 0){
            res.status(500).json({'message':'Could not process request for topid: ' + topid + ' and ' + tweetid});
            return;
          }else if(results0[0].cnt >= RATE_LIMIT){
            res.status(429).json({'message':'Rate limit exceeded for topid: ' + topid});
            return;
          }
          // insert into requests table the topicid, tweetid, clientid
          db.query('insert requests (topid,tweetid,clientid) values (?,?,?);',[topid,tweetid,clientid], function(errors1,results1){
            if(errors1 || results1.length === 0){
              res.status(500).json({'message':'Could not process request for topid: ' + topid + ' and ' + tweetid});
              return;
            }
            // get the count from the seens table for this topicid and tweetid
            db.query('select count(*) as cnt from seen where topid = ? and tweetid = ?;',[topid,tweetid],function(errors4,results4){
              if(errors4){
                console.log("Something bad happened: " + errors4);
                res.status(500).json({'message':'could not process request for topid: ' + topid + ' and ' + tweetid});
                return;
              }
              // If we have seen the tweet before, do nothing
              if(results4[0].cnt === 0){
                // Otherwise send it out to be judged and then insert it
                // get the topic title
                db.query('select title from topics where topid = ?;',topid,function(errors2,results2){
                  if(errors2 || results2.length === 0){
                    console.log('Something went horribly wrong');
                    res.status(500).json({'message':'could not process request for topid: ' + topid + ' and ' + tweetid});
                    return;
                  }
                  var title = results2[0].title
                  // select participants who were assigned to judged this topic
                  db.query('select partid from topic_assignments where topid = ?;',topid,function(errors3,results3){
                    if(errors3){
                      console.log('Something went horribly wrong')
                      res.status(500).json({'message':'could not process request for topid: ' + topid + ' and ' + tweetid});
                      return;
                    }

                    /// PROBLEM: Loading the IDs is not synchronous!
                    if(!loaded){
                      loaded = true;
                      // select all participants from the DB and add to registrationIds
                      db.query('select partid,email,twitterhandle from participants;',function(parerror,parresults){
                        console.log("take all participants from the DB and add to registrationIds");
                        for (var i = 0; i < parresults.length; i++) {
                          var part = parresults[i]
                          console.log("participants twitterhandle: " + part.twitterhandle)
                          registrationIds.push({'partid':part.partid,'twitterhandle':part.twitterhandle,'email':part.email});
                        }
                        // MAKE IT SYNCHRONOUS!
                        console.log(results3)
                        if (results3.length !== 0){
                          var ids = []
                          for(var idx = 0; idx < results3.length; idx++){
                            ids.push(results3[idx].partid)
                          }
                          // send tweet for judgement to the participants in ids
                          console.log("calling send_tweet....")
                          send_tweet(db, {"tweetid":tweetid,"topid":topid,"topic":title},ids);
                        }
                        // mark this tweet as seen so that it is not judged again
                        db.query('insert into seen (topid, tweetid) values (?,?);',[topid,tweetid],function(errors5,results5){
                          console.log(errors5)
                        });

                      });
                      console.log("in loaded: " + registrationIds)
                    }
                    else {
                      // results3 contains participants who were assigned to judge this topic
                      console.log(results3)
                      if (results3.length !== 0){
                        var ids = []
                        for(var idx = 0; idx < results3.length; idx++){
                          ids.push(results3[idx].partid)
                        }
                        // send tweet for judgement to the participants in ids
                        console.log("calling send_tweet....")
                        send_tweet(db, {"tweetid":tweetid,"topid":topid,"topic":title},ids);
                      }
                      // mark this tweet as seen so that it is not judged again
                      db.query('insert into seen (topid, tweetid) values (?,?);',[topid,tweetid],function(errors5,results5){
                        console.log(errors5)
                      });

                    }
                  });
                });
              }
            });
            res.status(204).send();
          });
        });
      });
    });
  });


  router.post('/register/system/', function(req,res){
    var groupid = req.body.groupid;
    var alias = req.body.alias;
    var db = req.db;
    var clientid = genID();
    validate_group(db,groupid,function(errors,results){
      if(errors || results.length === 0){
      	console.log(errors)
      	console.log(results)
        res.status(500).json({'message':'Unable to register a client for group: ' + groupid});
        return;
      }
      if (alias === undefined){
        alias = "NULL"
      }
      db.query('select count(*) as cnt from clients where groupid = ?;',[groupid],function(gerrors,gresults){
        if (gresults[0].cnt < MAX_CLIENTS){
          db.query('insert clients (groupid,clientid,ip,alias) values (?,?,?,?);',[groupid,clientid,req.ip,alias], function(errors1,results1){
            if(errors1){
              res.status(500).json({'message':'Unable to register system.'});
              return;
            }
            // No longer used with a unified table
            // db.query('create table requests_'+clientid+' like requests_template;'); // Assume this works for now
            // db.query('create table requests_digest_'+clientid+' like requests_template;'); // Assume this works for now
           res.json({'clientid':clientid});
          });
        }else{
          res.status(429).json({'message':'Too many client ids for group: ' + groupid});
        }
      });
    });
  });

  router.get('/topics/available/:uniqid/:topid', function(req,res){
    var db = req.db;
    var uniqid = req.params.uniqid;
    var topid = req.params.topid;
    validate_client_or_participant(db,uniqid,function(errors0,results0){
      if(errors0 || results0.length === 0){
        res.status(500).json({'message':'Unable to validate ID:' + uniqid});
        return;
      }
      db.query('select count(*) as cnt from topic_assignments where topid = ?;',topid,function(errors1,results1){
        if(errors1 || results1.length === 0){
          res.status(500).json({'message':'Error in determining topic availability.'});
          return;
        }else if(results1[0].cnt >= MAX_ASS){
          res.status(404).json({'message':'Sufficient assessors'});
          return;
        }
        res.status(204).send();
      });
    });
  });

  router.post('/topics/interest/:partid',function(req,res){
    var partid = req.params.partid;
    var topids = req.body;
    var db = req.db;
    validate_participant(db,partid,function(errors0,results0){
      if(errors0 || results0.length === 0){
        res.status(500).json({'message':'Unable to validate participant:'+partid});
        return
      }
      stmt = ""
      for (var i = 0; i < topids.length; i++){
        if (i !== 0){
          stmt += ',(\'' + topids[i] + '\',\'' + partid + '\')';
        } else {
          stmt += '(\'' + topids[i] + '\',\'' + partid + '\')';
        }
      }
      db.query('insert ignore into topic_assignments (topid,partid) values ' + [stmt],function(errors1,results1){
        if (errors1)
          res.status(500).json({'message': 'Unable to insert topics for partid:' + partid});
        res.status(204).send()
      });
    });
  });

  router.get('/topics/interest/:partid',function(req,res){
    var partid = req.params.partid;
    var db = req.db;
    validate_participant(db,partid,function(errors0,results0){
      if(errors0 || results0.length === 0){
        res.status(500).json({'message':'Unable to validate participant:'+partid});
        return
      }
      db.query('select topid from topic_assignments where partid = ?;',partid,function(errors1,results1){
        if(errors1){
          res.status(500).json({'message':'Unable to fetch assigned topics for: ' + partid})
          return;
        }
        res.json(results)
      });
    });
  });

  router.post('/topics/suggest/:uniqid',function(req,res){
    var db = req.db;
    var uniqid = req.params.uniqid;
    validate_client_or_participant(db,uniqid,function(errors0,results0){
      if(errors0 || results0.length === 0){
        res.status(500).json({'message':'Unable to validate: ' + uniqid})
        return;
      }
      db.query('insert into candidate_topics (title,description) values (?,?);',[req.body.title,req.body.desc],function(errors1,results1){
        if (errors1)
          res.status(500).json({'message': 'Unable to insert topic suggestions for:' + uniqid});
        res.status(204).send()
      });
    });
  });

  router.delete('/unregister/mobile/:partid',function(req,res){
    var partid = req.params.partid
    var idx = find_user(partid)
    if (idx > -1) registrationIds.splice(idx,1)
    res.status(204).send();
  });

  router.get('/log/:clientid',function(req,res){
    var clientid = req.params.clientid;
    var db = req.db;
    validate_client(db,clientid,function(errors,results){
      if(errors || results.length === 0){
        res.status(500).json({'message':'Unable to validate clientid:' + clientid});
        return;
      }
      db.query('select * from requests where clientid = ?;',clientid,function(errors1,results1){
        if(errors1){
          res.status(500).json({'message':'Unable to retrieve log for: ' + clientid});
          return;
        }
        res.status(200).json(results1);
      });
    });
  });

  router.get('/topics/:uniqid', function(req,res){
    var uniqid = req.params.uniqid;
    var db = req.db;
    validate_client_or_participant(db,uniqid,function(errors,results){
      if(errors || results.length === 0){
        res.status(500).json({'message':'Unable to validate ID: ' + uniqid});
        return;
      }
      db.query('select topid, title, description, narrative from topics;',function(errors1,results1){
        if(errors1){
          res.status(500).json({'message':'Unable to retrieve topics for client: ' + uniqid});
        }else{
          res.json(results1);
        }
      });
    });
  });

  // TODO: Figure out way to incorporate socket based connections without requiring an actual id

  io.on('connection', function(socket){
    socket.on('register',function(){
      console.log("Registered")
      registrationIds.push({'partid':socket,'type':'socket','conn':socket});
    });
    socket.on('judge',function(msg){
      console.log('Judged: ', msg.topid, msg.tweetid,msg.rel);
    });
    socket.once('disconnect',function(){
      console.log("Disconnect");
      var idx = find_user(socket);
      if (idx > -1) registrationIds.splice(idx,1);
    });
  });
  return router;
}

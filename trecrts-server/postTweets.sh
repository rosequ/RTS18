#! /bin/sh
count=0
topics=("RTS100" "RTS101" "RTS102" "RTS103" "RTS105")

tweet_ids=$(cut -d' ' -f3 qrelsfile-all.txt)

for id in $tweet_ids:
do
 echo $id
 randomTopic=${topics[$RANDOM % ${#topics[@]} ]}
 curl -X POST -H 'Content-Type: application/json'   localhost:8000/tweet/$randomTopic/$id/yyXL0Org14rI
 count=$(( count + 1 ))
 echo $randomTopic
 echo "sent $count tweets"
 sleep 5
done 

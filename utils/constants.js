const MAX = 25;
const MAX_RECOMMENDATIONS = 50;

module.exports = {
    MAX,
    MAX_RECOMMENDATIONS,
    checkAmount: function(amount){
        return amount > MAX ? MAX : amount;
    }
}
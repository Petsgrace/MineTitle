export const locationMapping = {
    "Manicaland": {
        districts: ["Buhera", "Chimanimani", "Chipinge", "Makoni", "Mutare", "Mutasa", "Nyanga"],
        nearestTowns: ["Mutare", "Rusape", "Chipinge", "Nyanga", "Chimanimani"],
        towns: {
            "Buhera": ["Murambinda", "Birchenough Bridge"],
            "Chimanimani": ["Chimanimani", "Cashel"],
            "Chipinge": ["Chipinge", "Checheche"],
            "Makoni": ["Rusape", "Nyazura"],
            "Mutare": ["Mutare", "Penhalonga"],
            "Mutasa": ["Hauna", "Watsomba"],
            "Nyanga": ["Nyanga", "Troutbeck"]
        }
    },
    "Mashonaland Central": {
        districts: ["Bindura", "Centenary", "Guruve", "Mazowe", "Mbire", "Mount Darwin", "Rushinga", "Shamva"],
        nearestTowns: ["Bindura", "Mvurwi", "Mount Darwin", "Shamva", "Mazowe"],
        towns: {
            "Bindura": ["Bindura", "Matepatepa"],
            "Centenary": ["Centenary", "Muzarabani"],
            "Guruve": ["Guruve", "Shinshin"],
            "Mazowe": ["Concession", "Glendale", "Mvurwi"],
            "Mbire": ["Mushumbi Pools", "Kanyemba"],
            "Mount Darwin": ["Mount Darwin", "Dotito"],
            "Rushinga": ["Rushinga", "Nyamatikiti"],
            "Shamva": ["Shamva", "Madziwa"]
        }
    },
    "Mashonaland East": {
        districts: ["Chikomba", "Goromonzi", "Hwedza", "Marondera", "Mudzi", "Murehwa", "Mutoko", "Seke", "UMP", "Wedza"],
        nearestTowns: ["Marondera", "Chivhu", "Mutoko", "Murewa", "Goromonzi"],
        towns: {
            "Chikomba": ["Chivhu", "Enkeldoorn"],
            "Goromonzi": ["Ruwa", "Goromonzi"],
            "Hwedza": ["Hwedza", "Mushandirapamwe"],
            "Marondera": ["Marondera", "Macheke"],
            "Mudzi": ["Kotwa", "Mudzi"],
            "Murehwa": ["Murehwa", "Macheke"],
            "Mutoko": ["Mutoko", "Nyamuzuwe"],
            "Seke": ["Beatrice", "Mahusekwa"],
            "UMP": ["Mutawatawa", "Uzumba"],
            "Wedza": ["Wedza", "Mount St Mary's"]
        }
    },
    "Mashonaland West": {
        districts: ["Chegutu", "Chinhoyi", "Hurungwe", "Kadoma", "Kariba", "Makonde", "Mhondoro-Ngezi", "Sanyati", "Zvimba", "Norton", "Karoi"],
        nearestTowns: ["Chinhoyi", "Kadoma", "Chegutu", "Kariba", "Norton", "Karoi"],
        towns: {
            "Chegutu": ["Chegutu", "Chakari"],
            "Chinhoyi": ["Chinhoyi", "Alaska"],
            "Hurungwe": ["Magunje", "Karoi"],
            "Kadoma": ["Kadoma", "Sanyati"],
            "Kariba": ["Kariba", "Mhangura"],
            "Makonde": ["Mhangura", "Makonde"],
            "Mhondoro-Ngezi": ["Mubaira", "Selous"],
            "Sanyati": ["Sanyati", "Chakari"],
            "Zvimba": ["Murombedzi", "Banket"],
            "Norton": ["Norton"],
            "Karoi": ["Karoi"]
        }
    },
    "Masvingo": {
        districts: ["Bikita", "Chiredzi", "Chivi", "Gutu", "Masvingo", "Mwenezi", "Zaka"],
        nearestTowns: ["Masvingo", "Chiredzi", "Triangle", "Gutu (Mupandawana)", "Zaka"],
        towns: {
            "Bikita": ["Nyika", "Bikita"],
            "Chiredzi": ["Chiredzi", "Triangle", "Hippo Valley"],
            "Chivi": ["Chivi", "Ngundu"],
            "Gutu": ["Gutu", "Mpandawana"],
            "Masvingo": ["Masvingo", "Mashava"],
            "Mwenezi": ["Neshuro", "Rutenga"],
            "Zaka": ["Zaka", "Jerera"]
        }
    },
    "Matabeleland North": {
        districts: ["Binga", "Bubi", "Hwange", "Lupane", "Nkayi", "Tsholotsho", "Umguza", "Victoria Falls"],
        nearestTowns: ["Lupane", "Victoria Falls", "Hwange", "Binga"],
        towns: {
            "Binga": ["Binga", "Kamativi"],
            "Bubi": ["Turk Mine", "Inyathi"],
            "Hwange": ["Hwange", "Dete"],
            "Lupane": ["Lupane", "Kenmaur"],
            "Nkayi": ["Nkayi", "Zenka"],
            "Tsholotsho": ["Tsholotsho"],
            "Umguza": ["Nyamandlovu", "Upper Rangemore"],
            "Victoria Falls": ["Victoria Falls"]
        }
    },
    "Matabeleland South": {
        districts: ["Beitbridge", "Bulilima", "Gwanda", "Insiza", "Mangwe", "Matobo", "Umzingwane", "Plumtree"],
        nearestTowns: ["Gwanda", "Beitbridge", "Plumtree", "Filabusi"],
        towns: {
            "Beitbridge": ["Beitbridge"],
            "Bulilima": ["Plumtree", "Figtree"],
            "Gwanda": ["Gwanda", "Colleen Bawn"],
            "Insiza": ["Filabusi", "Shangani"],
            "Mangwe": ["Plumtree", "Brunapeg"],
            "Matobo": ["Maphisa", "Kezi"],
            "Umzingwane": ["Esigodini", "Ncema"],
            "Plumtree": ["Plumtree"]
        }
    },
    "Midlands": {
        districts: ["Chirumanzu", "Gokwe North", "Gokwe South", "Gweru", "Kwekwe", "Mberengwa", "Shurugwi", "Zvishavane", "Redcliff"],
        nearestTowns: ["Gweru", "Kwekwe", "Redcliff", "Zvishavane", "Shurugwi", "Gokwe"],
        towns: {
            "Chirumanzu": ["Mvuma", "Lalapanzi"],
            "Gokwe North": ["Gokwe", "Nembudziya"],
            "Gokwe South": ["Gokwe", "Sengwa"],
            "Gweru": ["Gweru", "Gutu"],
            "Kwekwe": ["Kwekwe", "Zhombe"],
            "Mberengwa": ["Mberengwa", "Mataga"],
            "Shurugwi": ["Shurugwi"],
            "Zvishavane": ["Zvishavane"],
            "Redcliff": ["Redcliff"]
        }
    },
    "Harare": {
        districts: ["Harare", "Epworth", "Chitungwiza"],
        nearestTowns: ["Harare", "Chitungwiza", "Ruwa", "Epworth"],
        towns: {
            "Harare": ["Harare", "Mbare", "Highfield"],
            "Epworth": ["Epworth"],
            "Chitungwiza": ["Chitungwiza"]
        }
    },
    "Bulawayo": {
        districts: ["Bulawayo"],
        nearestTowns: ["Bulawayo"],
        towns: {
            "Bulawayo": ["Bulawayo", "Cowdray Park", "Nkulumane"]
        }
    }
};

export const provinces = Object.keys(locationMapping);
